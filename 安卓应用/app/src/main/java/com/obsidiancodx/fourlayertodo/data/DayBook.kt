package com.obsidiancodx.fourlayertodo.data

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import org.json.JSONObject
import java.time.*
import java.util.UUID

data class TimeBlock(
    val id: String = UUID.randomUUID().toString(),
    val title: String, val category: String = "工作", val start: Long,
    val end: Long = start, val kind: String = "actual", val taskId: String = "",
    val note: String = "", val running: Boolean = false, val reminder: Boolean = false,
    val version: String = UUID.randomUUID().toString(), val parent: String = "",
    val deleted: Boolean = false, val conflict: Boolean = false
) {
    fun json() = JSONObject().put("id", id).put("title", title).put("category", category)
        .put("start", start).put("end", end).put("kind", kind).put("taskId", taskId)
        .put("note", note).put("running", running).put("reminder", reminder)
        .put("version", version).put("parent", parent).put("deleted", deleted)
    fun revision() = copy(parent = version, version = UUID.randomUUID().toString())
    companion object {
        fun parse(j: JSONObject) = TimeBlock(j.getString("id"), j.getString("title"),
            j.getString("category"), j.getLong("start"), j.getLong("end"), j.getString("kind"),
            j.optString("taskId"), j.optString("note"), j.optBoolean("running"),
            j.optBoolean("reminder"), j.getString("version"), j.optString("parent"), j.optBoolean("deleted"))
        fun resolve(events: List<TimeBlock>, includeDeleted: Boolean = false): List<TimeBlock> = events.distinct()
            .groupBy { it.id }.values.flatMap { versions ->
                val parents = versions.map { it.parent }.toSet()
                val leaves = versions.filter { it.version !in parents }
                check(versions.groupBy { it.version }.values.none { it.size > 1 }) {
                    "同一时间记录版本出现不同内容，请核对同步冲突文件；原文件均已保留"
                }
                leaves.filter { includeDeleted || !it.deleted }.map { it.copy(conflict = leaves.size > 1) }
            }.sortedBy { it.start }
    }
}

class DayBook(private val context: Context) {
    private val store = VaultDocumentStore(context)
    private fun folder(uri: Uri, create: Boolean): DocumentFile? {
        val root = store.todoRoot(uri).document
        return root.findFile("时间记录") ?: if (create) root.createDirectory("时间记录") else null
    }
    fun load(uri: Uri, includeDeleted: Boolean = false): List<TimeBlock> {
        val dir = folder(uri, false) ?: return emptyList()
        return TimeBlock.resolve(dir.listFiles().filter { it.name?.endsWith(".md") == true }.map { file ->
            val raw = store.read(file, file.name.orEmpty()).raw
            val json = raw.substringAfter("```json\n", "").substringBefore("\n```")
            check(json.isNotBlank()) { "时间记录无法解析：${file.name}；原文件已保留" }
            TimeBlock.parse(JSONObject(json))
        }, includeDeleted)
    }
    fun save(uri: Uri, block: TimeBlock) {
        require(block.title.isNotBlank()) { "请填写活动名称" }
        require(block.end >= block.start) { "结束不能早于开始" }
        val current = load(uri, true).filter { it.id == block.id }
        if (block.parent.isNotEmpty()) check(current.size == 1 && current.single().version == block.parent && !current.single().conflict) {
            "记录已被另一台设备修改，请刷新；冲突版本均已保留"
        }
        val dir = folder(uri, true) ?: error("不能创建时间记录目录")
        val name = "${block.id}-${block.version}.md"
        check(dir.findFile(name) == null) { "记录已经保存，请刷新" }
        val file = dir.createFile("text/markdown", name) ?: error("无法创建记录")
        val content = "# ${block.title.replace('\n', ' ')}\n\n```json\n${block.json()}\n```\n\n${block.category} · ${Instant.ofEpochMilli(block.start).atZone(ZoneId.systemDefault())}\n\n${block.note}\n"
        context.contentResolver.openOutputStream(file.uri, "wt")?.use { it.write(content.toByteArray()) }
            ?: error("无法保存记录")
        check(store.read(file, name).raw == content) { "记录写后校验失败，请刷新检查" }
    }
    fun dailyFile(uri: Uri, day: LocalDate): DocumentFile? {
        var dir = DocumentFile.fromTreeUri(context, uri) ?: return null
        for (part in listOf("40_个人资料", "个人记录", "时间线")) dir = dir.findFile(part) ?: return null
        return dir.findFile("$day.md") ?: dir.findFile(day.toString().take(7))?.findFile("$day.md")
    }
    fun dailyText(uri: Uri, day: LocalDate): String = dailyFile(uri, day)?.let { store.read(it, "$day.md").raw }.orEmpty()
    fun exportDay(uri: Uri, day: LocalDate): String {
        val blocks = load(uri).filter { !it.running && !it.conflict && it.kind != "plan" &&
            Instant.ofEpochMilli(it.start).atZone(ZoneId.systemDefault()).toLocalDate() == day }
        var dir = DocumentFile.fromTreeUri(context, uri) ?: error("请授权整个 Obsidian 库")
        for (part in listOf("40_个人资料", "个人记录", "时间线")) dir = dir.findFile(part)
            ?: error("请通过目录按钮授权整个 Obsidian 库，才能写回个人时间线")
        val file = dailyFile(uri, day) ?: dir.createFile("text/markdown", "$day.md") ?: error("无法创建日记")
        val old = store.read(file, "$day.md")
        val begin = "<!-- four-layer-time:start -->"
        val finish = "<!-- four-layer-time:end -->"
        val lines = blocks.joinToString("\n") { b ->
            val s = Instant.ofEpochMilli(b.start).atZone(ZoneId.systemDefault())
            val e = Instant.ofEpochMilli(b.end).atZone(ZoneId.systemDefault())
            val endLabel = if (s.toLocalDate() == e.toLocalDate()) e.toLocalTime().toString().take(5) else "${e.toLocalDate()} ${e.toLocalTime().toString().take(5)}"
            "${s.toLocalTime().toString().take(5)}${if (b.kind == "note") "" else "–$endLabel"} ${b.category} · ${b.title.replace('\n', ' ')}${if (b.kind == "note") "" else "（${(b.end-b.start)/60000} 分钟）"}${if(b.note.isBlank()) "" else "\n${b.note}"}"
        }
        val section = "$begin\n## 活动记录\n\n$lines\n$finish"
        val next = DailySection.merge(old.raw, section)
        store.updateMarkdown(old, next)
        return "已写回 $day；原文字和睡眠区块保留"
    }
}

internal object DailySection {
    private const val begin = "<!-- four-layer-time:start -->"
    private const val finish = "<!-- four-layer-time:end -->"
    fun merge(raw: String, section: String): String {
        fun count(text: String, marker: String) = text.windowed(marker.length).count { it == marker }
        check(count(section, begin) == 1 && count(section, finish) == 1) { "记录内容不能包含时间线区块标记" }
        val start = raw.indexOf(begin); val end = raw.indexOf(finish)
        check((start < 0 && end < 0) || (start >= 0 && end > start && count(raw, begin) == 1 && count(raw, finish) == 1)) {
            "活动记录标记不完整或重复，请先检查日记"
        }
        return if (start >= 0) raw.replaceRange(start, end + finish.length, section) else raw + "\n\n$section\n"
    }
}
