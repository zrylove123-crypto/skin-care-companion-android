package com.zrylove123.skincare;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "skin-care-reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        String period = intent.getStringExtra("period");
        boolean morning = "morning".equals(period);
        createChannel(context);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            morning ? 1001 : 1002,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        android.app.Notification notification = new android.app.Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(com.zrylove123.skincare.R.drawable.ic_launcher)
            .setContentTitle("护肤搭子｜" + (morning ? "早间提醒" : "晚间提醒"))
            .setContentText(morning
                ? "洗脸 → 按需PM乳 → 防晒，点开看今天是否需要双抗。"
                : "洁面 → PM乳，点开确认今晚是否需要水杨酸。")
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build();
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE))
            .notify(morning ? 2001 : 2002, notification);
    }

    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "每日护肤提醒",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("按设置的早晚时间提醒护肤");
            ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE))
                .createNotificationChannel(channel);
        }
    }
}
