package com.zrylove123.skincare;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences preferences = context.getSharedPreferences("skin_native", Context.MODE_PRIVATE);
        MainActivity.scheduleDaily(context, "morning", preferences.getString("morning", "08:30"));
        MainActivity.scheduleDaily(context, "evening", preferences.getString("evening", "23:00"));
    }
}
