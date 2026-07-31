package net.stokescloud.pulse

import android.annotation.SuppressLint
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
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var errorView: View
    private var loadFailed = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

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

        webView.loadUrl(getString(R.string.base_url))
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
