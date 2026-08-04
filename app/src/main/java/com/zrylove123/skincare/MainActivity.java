package com.zrylove123.skincare;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4101;
    private static final int NOTIFICATION_REQUEST = 4102;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private SharedPreferences preferences;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences("skin_native", MODE_PRIVATE);
        ReminderReceiver.createChannel(this);

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " SkinCareCompanion/1.0");

        webView.addJavascriptInterface(new NativeBridge(), "SkinNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_REQUEST && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            new ReminderReceiver().onReceive(this, new Intent().putExtra("period", "evening"));
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    public static void scheduleDaily(Context context, String period, String value) {
        String[] parts = value.split(":");
        int hour = parts.length > 0 ? safeInt(parts[0], "morning".equals(period) ? 8 : 23) : 8;
        int minute = parts.length > 1 ? safeInt(parts[1], 0) : 0;
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);

        Intent intent = new Intent(context, ReminderReceiver.class).putExtra("period", period);
        int requestCode = "morning".equals(period) ? 1001 : 1002;
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        manager.cancel(pending);
        manager.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            next.getTimeInMillis(),
            AlarmManager.INTERVAL_DAY,
            pending
        );
    }

    private static int safeInt(String value, int fallback) {
        try { return Integer.parseInt(value); } catch (Exception ignored) { return fallback; }
    }

    private void runJavaScript(String function, String text, boolean success) {
        String script = function + "(" + JSONObject.quote(text) + "," + success + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    public class NativeBridge {
        @JavascriptInterface
        public String appVersion() { return "1.0.1"; }

        @JavascriptInterface
        public String getNativeSettings() {
            JSONObject result = new JSONObject();
            try {
                result.put("morning", preferences.getString("morning", "08:30"));
                result.put("evening", preferences.getString("evening", "23:00"));
                result.put("aiConfigured", !preferences.getString("ai_key", "").isEmpty());
                result.put("aiEndpoint", preferences.getString("ai_endpoint", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"));
                result.put("aiModel", preferences.getString("ai_model", "qwen3-vl-plus"));
                result.put("aiProtocol", preferences.getString("ai_protocol", "chat_completions"));
            } catch (Exception ignored) { }
            return result.toString();
        }

        @JavascriptInterface
        public void saveReminderTimes(String morning, String evening) {
            preferences.edit().putString("morning", morning).putString("evening", evening).apply();
            scheduleDaily(MainActivity.this, "morning", morning);
            scheduleDaily(MainActivity.this, "evening", evening);
        }

        @JavascriptInterface
        public void enableNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
                } else {
                    new ReminderReceiver().onReceive(MainActivity.this, new Intent().putExtra("period", "evening"));
                }
            });
        }

        @JavascriptInterface
        public void openAppNotificationSettings() {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(intent);
        }

        @JavascriptInterface
        public String saveAiConfig(String protocol, String endpoint, String model, String key) {
            protocol = protocol == null ? "chat_completions" : protocol.trim();
            endpoint = endpoint == null ? "" : endpoint.trim();
            model = model == null ? "" : model.trim();
            key = key == null ? "" : key.trim();
            if (!endpoint.startsWith("https://")) return "接口地址必须以 https:// 开头";
            if (model.length() < 2) return "请填写模型名称";
            if (key.length() < 8) return "请粘贴完整的API密钥";
            preferences.edit()
                .putString("ai_protocol", protocol)
                .putString("ai_endpoint", endpoint)
                .putString("ai_model", model)
                .putString("ai_key", key)
                .apply();
            return "ok";
        }

        @JavascriptInterface
        public void clearAiConfig() {
            preferences.edit().remove("ai_key").apply();
        }

        @JavascriptInterface
        public void sendChat(String payload) {
            new Thread(() -> {
                try {
                    String key = preferences.getString("ai_key", "");
                    if (key.isEmpty()) throw new Exception("请先到设置页连接AI接口。流程、打卡和提醒不受影响。");
                    String protocol = preferences.getString("ai_protocol", "chat_completions");
                    String endpoint = preferences.getString("ai_endpoint", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
                    String model = preferences.getString("ai_model", "qwen3-vl-plus");
                    JSONObject input = new JSONObject(payload);
                    JSONObject request = "chat_completions".equals(protocol)
                        ? compatibleRequest(input, model)
                        : responsesRequest(input, model);
                    String answer = callAi(endpoint, key, request, protocol);
                    runJavaScript("window.onNativeChat", answer, true);
                } catch (Exception error) {
                    String message = error.getMessage();
                    runJavaScript("window.onNativeChat", message == null ? "AI暂时连接不上，请稍后再试。" : message, false);
                }
            }).start();
        }
    }

    private static final String SYSTEM_PROMPT = "你是刘智群的私人护肤搭子，主要用简明、可靠的中文和他沟通，语气自然，可以偶尔称呼他为 bro。\n\n"
        + "已知情况：男性，偏油皮；鼻部皮脂丝和轻度堵塞；下巴容易受剃须刺激；脸颊有稳定的浅褐色点和肤色不均；鼻旁深色点长期稳定；眉间和耳朵不痒；头皮偶尔痒但没有白屑或油屑。没有看到严重痤疮。\n\n"
        + "当前产品与计划：CeraVe泡沫洁面、CeraVe PM乳、赠品C乳、理肤泉绿标控油防晒、宝拉2%水杨酸、珀莱雅双抗4.0、身体10%尿素。第1—14天只用清洁/PM乳/防晒；第15—28天周一周四晚局部水杨酸；第29—42天周二周五周日早加双抗；第43天起双抗耐受后可每天早上使用。水杨酸保持每周两晚；剃须当天及之后24小时不用。\n\n"
        + "回答规则：优先结合当天阶段、剃须、出油、干燥和刺激记录给出具体下一步；不擅自增加一堆产品；照片不清楚时说明不确定并指导重拍；不把色素点直接诊断为疾病；快速变化、出血、破溃、持续疼痛、明显肿胀或大片皮疹时建议线下皮肤科；答案尽量300字内，先结论再说做法。";

    private JSONObject responsesRequest(JSONObject input, String model) throws Exception {
        JSONArray messages = input.optJSONArray("messages");
        JSONArray outgoing = new JSONArray();
        if (messages != null) {
            for (int i = 0; i < messages.length(); i++) {
                JSONObject message = messages.getJSONObject(i);
                if (i == messages.length() - 1 && !input.optString("image").isEmpty()) {
                    JSONArray content = new JSONArray();
                    content.put(new JSONObject().put("type", "input_text").put("text", message.optString("content") + "\n今日状态：" + input.optJSONObject("context")));
                    content.put(new JSONObject().put("type", "input_image").put("image_url", input.optString("image")));
                    outgoing.put(new JSONObject().put("role", "user").put("content", content));
                } else {
                    outgoing.put(new JSONObject().put("role", message.optString("role")).put("content", message.optString("content")));
                }
            }
        }
        return new JSONObject()
            .put("model", model)
            .put("instructions", SYSTEM_PROMPT)
            .put("input", outgoing)
            .put("max_output_tokens", 700);
    }

    private JSONObject compatibleRequest(JSONObject input, String model) throws Exception {
        JSONArray outgoing = new JSONArray();
        outgoing.put(new JSONObject().put("role", "system").put("content", SYSTEM_PROMPT));
        JSONArray messages = input.optJSONArray("messages");
        if (messages != null) {
            for (int i = 0; i < messages.length(); i++) {
                JSONObject message = messages.getJSONObject(i);
                if (i == messages.length() - 1 && !input.optString("image").isEmpty()) {
                    JSONArray content = new JSONArray();
                    content.put(new JSONObject().put("type", "text").put("text", message.optString("content") + "\n今日状态：" + input.optJSONObject("context")));
                    content.put(new JSONObject().put("type", "image_url").put("image_url", new JSONObject().put("url", input.optString("image"))));
                    outgoing.put(new JSONObject().put("role", "user").put("content", content));
                } else {
                    outgoing.put(new JSONObject().put("role", message.optString("role")).put("content", message.optString("content")));
                }
            }
        }
        return new JSONObject().put("model", model).put("messages", outgoing).put("max_tokens", 700);
    }

    private String callAi(String endpoint, String key, JSONObject request, String protocol) throws Exception {
        URL url = new URL(endpoint);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + key);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        try (OutputStream output = connection.getOutputStream()) {
            output.write(request.toString().getBytes(StandardCharsets.UTF_8));
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        String body = readAll(stream);
        if (status < 200 || status >= 300) {
            if (status == 401) throw new Exception("API密钥验证失败，请到设置页重新填写。");
            if (status == 429) throw new Exception("接口额度不足或请求过快，请稍后再试。");
            throw new Exception("AI接口返回错误（" + status + "），请检查接口地址和模型名称。");
        }
        JSONObject result = new JSONObject(body);
        if ("chat_completions".equals(protocol)) {
            return result.getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content", "没有生成完整回复，请重试。");
        }
        JSONArray output = result.optJSONArray("output");
        if (output != null) {
            for (int i = 0; i < output.length(); i++) {
                JSONArray content = output.getJSONObject(i).optJSONArray("content");
                if (content == null) continue;
                for (int j = 0; j < content.length(); j++) {
                    JSONObject item = content.getJSONObject(j);
                    if ("output_text".equals(item.optString("type"))) return item.optString("text");
                }
            }
        }
        return "我收到了，但这次没有生成完整回复，请重新发一次。";
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }
}
