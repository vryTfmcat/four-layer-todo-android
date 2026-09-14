package com.obsidiancodx.fourlayertodo

import android.app.*
import android.content.*
import android.os.Build
import com.obsidiancodx.fourlayertodo.data.TimeBlock
import org.json.JSONArray

object Reminders {
    fun schedule(context: Context, blocks: List<TimeBlock>) {
        val prefs = context.getSharedPreferences("reminders", 0)
        val alarm = context.getSystemService(AlarmManager::class.java)
        prefs.getStringSet("scheduled", emptySet())!!.forEach { key ->
            alarm.cancel(pending(context, key, ""))
        }
        val active = blocks.filter { it.kind == "plan" && it.reminder && !it.conflict && it.start > System.currentTimeMillis() }
        active.forEach { b ->
            // Best-effort local reminders; UI does not promise exact delivery.
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, b.start, pending(context, b.id, b.title))
        }
        prefs.edit().putStringSet("scheduled", active.map { it.id }.toSet())
            .putString("blocks", JSONArray(active.map { it.json() }).toString()).apply()
    }
    private fun pending(c: Context, key: String, title: String): PendingIntent = PendingIntent.getBroadcast(c, 0,
        Intent(c, ReminderReceiver::class.java).setAction(key).putExtra("title", title),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

class ReminderReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action in listOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) {
            val p = context.getSharedPreferences("reminders", 0)
            val list = JSONArray(p.getString("blocks", "[]"))
            Reminders.schedule(context, (0 until list.length()).map { TimeBlock.parse(list.getJSONObject(it)) })
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("plans", "计划开始提醒", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        manager.notify(intent.action.orEmpty().hashCode(), Notification.Builder(context, "plans")
            .setSmallIcon(android.R.drawable.ic_menu_today).setContentTitle("计划开始")
            .setContentText(intent.getStringExtra("title")).setContentIntent(open).setAutoCancel(true).build())
    }
}
