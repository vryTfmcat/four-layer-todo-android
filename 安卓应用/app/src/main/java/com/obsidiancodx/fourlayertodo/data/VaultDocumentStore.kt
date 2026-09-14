package com.obsidiancodx.fourlayertodo.data

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import android.os.ParcelFileDescriptor
import java.security.MessageDigest

data class VaultFile(
    val document: DocumentFile,
    val relativePath: String,
    val raw: String,
    val hash: String,
    val modifiedAt: Long
)

data class TodoRoot(
    val document: DocumentFile,
    val label: String
)

class VaultDocumentStore(private val context: Context) {
    private val resolver: ContentResolver get() = context.contentResolver

    fun persistPermission(treeUri: Uri) {
        resolver.takePersistableUriPermission(
            treeUri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        )
    }

    fun todoRoot(treeUri: Uri): TodoRoot {
        val selected = DocumentFile.fromTreeUri(context, treeUri)
            ?: error("无法打开所选目录")
        val direct = selected.takeIf(::looksLikeTodoRoot)
        if (direct != null) return TodoRoot(direct, direct.name ?: "待办")

        val inbox = selected.findFile("00_Inbox")?.takeIf { it.isDirectory }
        val nested = inbox?.findFile("待办")?.takeIf { it.isDirectory }
        if (nested != null && looksLikeTodoRoot(nested)) {
            return TodoRoot(nested, "${selected.name ?: "Obsidian"}/00_Inbox/待办")
        }

        val child = selected.findFile("待办")?.takeIf { it.isDirectory }
        if (child != null && looksLikeTodoRoot(child)) {
            return TodoRoot(child, "${selected.name ?: "Obsidian"}/待办")
        }
        error("所选目录中没有四层待办。请选择 Obsidian 库根目录、00_Inbox，或待办目录")
    }

    fun scanMarkdown(treeUri: Uri): Pair<TodoRoot, List<VaultFile>> {
        val root = todoRoot(treeUri)
        val output = mutableListOf<VaultFile>()
        listOf("白板", "缓存工作台", "任务存储器").forEach { name ->
            root.document.findFile(name)?.takeIf { it.isDirectory }?.let { walk(it, name, output) }
        }
        return root to output
    }

    fun findMarkdown(treeUri: Uri, relativePath: String): VaultFile {
        val segments = relativePath.replace('\\', '/').split('/').filter(String::isNotBlank)
        require(segments.isNotEmpty()) { "空的待办路径" }
        var current = todoRoot(treeUri).document
        segments.dropLast(1).forEach { segment ->
            current = current.findFile(segment)?.takeIf { it.isDirectory }
                ?: error("待办目录不存在：$relativePath")
        }
        val file = current.findFile(segments.last())?.takeIf { it.isFile }
            ?: error("待办文件不存在：$relativePath")
        return read(file, relativePath)
    }

    fun updateMarkdown(expected: VaultFile, newContent: String): VaultFile {
        val current = read(expected.document, expected.relativePath)
        check(current.hash == expected.hash) {
            "${expected.relativePath} 已在 Obsidian 或同步工具中修改，已停止覆盖"
        }
        val normalized = newContent
        val backup = java.io.File(context.filesDir, "recovery-${java.util.UUID.randomUUID()}.md")
        backup.writeText(current.raw)
        writeDurably(expected.document, normalized)
        val verified = read(expected.document, expected.relativePath)
        if (verified.hash != sha256(normalized)) {
            error("${expected.relativePath} 写入校验失败，原文已保存在本机恢复文件；请检查同步冲突")
        }
        return verified
    }

    private fun looksLikeTodoRoot(directory: DocumentFile): Boolean =
        directory.findFile("白板")?.isDirectory == true &&
            directory.findFile("缓存工作台")?.isDirectory == true &&
            directory.findFile("任务存储器")?.isDirectory == true

    fun read(document: DocumentFile, relativePath: String): VaultFile {
        val raw = resolver.openInputStream(document.uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            ?: error("无法读取 $relativePath")
        return VaultFile(document, relativePath, raw, sha256(raw), document.lastModified())
    }

    private fun writeDurably(document: DocumentFile, content: String) {
        val descriptor = resolver.openFileDescriptor(document.uri, "rwt")
            ?: error("无法写入 ${document.name}")
        ParcelFileDescriptor.AutoCloseOutputStream(descriptor).use { stream ->
            stream.write(content.toByteArray(Charsets.UTF_8))
            stream.flush()
            stream.fd.sync()
        }
    }

    private fun walk(directory: DocumentFile, prefix: String, output: MutableList<VaultFile>) {
        directory.listFiles().sortedBy { it.name }.forEach { child ->
            val name = child.name ?: return@forEach
            val relative = "$prefix/$name"
            when {
                child.isDirectory -> walk(child, relative, output)
                child.isFile && name.endsWith(".md", ignoreCase = true) ->
                    output += read(child, relative)
            }
        }
    }

    companion object {
        fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
