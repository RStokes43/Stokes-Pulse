package net.stokescloud.pulse

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var errorView: View
    private var loadFailed = false

    // Derived from base_url so the app's own host only needs to be defined
    // once — anything the WebView tries to navigate to that isn't this host
    // (Google's sign-in pages, account chooser, etc.) gets handed off to a
    // Custom Tab instead, since Google blocks its sign-in flow from loading
    // inside embedded WebViews.
    private lateinit var appHost: String
    private lateinit var tokenLoginUrl: String

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val baseUri = Uri.parse(getString(R.string.base_url))
        appHost = baseUri.host ?: ""
        tokenLoginUrl = "${baseUri.scheme}://${baseUri.host}/auth/token-login"

        webView = findViewById(R.id.web_view)
        swipeRefresh = findViewById(R.id.swipe_refresh)
        errorView = findViewById(R.id.error_view)

        // Persist cookies (the Flask session cookie) across app restarts so the
        // user only has to log in once — it survives until the 30-day session
        // expires or they explicitly log out.
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        webView.settings.userAgentString = webView.settings.userAgentString + " StokesPulseAndroid/1.0"

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                loadFailed = false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefresh.isRefreshing = false
                CookieManager.getInstance().flush()
                if (!loadFailed) {
                    errorView.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                if (uri.host != null && uri.host != appHost) {
                    CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, uri)
                    return true
                }
                return false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                // Only treat a failure of the top-level page load as fatal —
                // ignore errors from sub-resources (e.g. a flaky background poll).
                if (request?.isForMainFrame == true) {
                    loadFailed = true
                    swipeRefresh.isRefreshing = false
                    webView.visibility = View.GONE
                    errorView.visibility = View.VISIBLE
                }
            }
        }

        swipeRefresh.setOnRefreshListener { webView.reload() }
        findViewById<android.widget.Button>(R.id.retry_button).setOnClickListener {
            errorView.visibility = View.GONE
            webView.visibility = View.VISIBLE
            webView.reload()
        }

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }

        if (!handleAuthCallback(intent)) {
            webView.loadUrl(getString(R.string.base_url))
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthCallback(intent)
    }

    /**
     * Custom Tabs' cookie jar is separate from the WebView's CookieManager, so
     * Google sign-in completing there can't hand the session back with a
     * simple redirect into the WebView — the callback instead redirects to
     * stokespulse://auth-callback?token=..., which Android routes here. We
     * then POST that one-time token to the app's own token-login endpoint
     * *from inside the WebView*, so the resulting session cookie lands where
     * the app can actually use it.
     *
     * A real, engine-submitted HTML form (rather than WebView.postUrl, whose
     * Content-Type behavior isn't reliably documented) guarantees the request
     * arrives as proper application/x-www-form-urlencoded, which the backend
     * requires to read the token out of request.form.
     */
    private fun handleAuthCallback(intent: Intent?): Boolean {
        val uri = intent?.data ?: return false
        if (uri.scheme != "stokespulse" || uri.host != "auth-callback") return false
        val token = uri.getQueryParameter("token") ?: return false
        val escapedToken = android.text.Html.escapeHtml(token)
        val html = """
            <!doctype html><html><body onload="document.forms[0].submit()">
            <form method="post" action="$tokenLoginUrl">
              <input type="hidden" name="token" value="$escapedToken">
            </form>
            </body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        return true
    }

    override fun onPause() {
        super.onPause()
        // The dashboard polls every 3s now — stop those JS timers while
        // backgrounded instead of burning battery/data for no visible benefit.
        webView.pauseTimers()
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        webView.resumeTimers()
    }
}
