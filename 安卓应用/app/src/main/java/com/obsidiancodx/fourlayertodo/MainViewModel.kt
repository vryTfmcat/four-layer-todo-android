package com.obsidiancodx.fourlayertodo

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.obsidiancodx.fourlayertodo.model.TodoLayer
import com.obsidiancodx.fourlayertodo.model.TodoTask
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.obsidiancodx.fourlayertodo.data.*
import java.time.LocalDate
import org.json.JSONObject

data class TodoUiState(
    val blocks: List<TimeBlock> = emptyList(),
    val canvas: String = "{}",
    val objects: List<Pair<String, String>> = emptyList(),
    val journal: String = "",
    val day: LocalDate = LocalDate.now(),
    val remindersEnabled: Boolean = false,
    val tasks: List<TodoTask> = emptyList(),
    val duplicateCount: Int = 0,
    val rootLabel: String = "",
    val selectedLayer: TodoLayer? = TodoLayer.WHITEBOARD,
    val query: String = "",
    val busy: Boolean = false,
    val message: String = "请选择 Obsidian 库或待办目录"
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = (application as FourLayerTodoApplication).repository
    private val prefs = application.getSharedPreferences("four-layer-todo", 0)
    private val book = DayBook(application)
    private val store = VaultDocumentStore(application)
    private val _state = MutableStateFlow(TodoUiState())
    val state: StateFlow<TodoUiState> = _state.asStateFlow()

    val treeUri: Uri?
        get() = prefs.getString("treeUri", null)?.let(Uri::parse)

    init {
        treeUri?.let { refresh(it) }
    }

    fun selectVault(uri: Uri) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(tasks = emptyList(), blocks = emptyList(), canvas = "{}", journal = "", objects = emptyList())
        runCatching { repository.persistPermission(uri) }
            .onFailure {
                _state.value = _state.value.copy(message = "无法保存目录权限：${it.message}")
                return
            }
        prefs.edit().putString("treeUri", uri.toString()).apply()
        refresh(uri)
    }

    fun refresh(uri: Uri? = treeUri, confirmation: String? = null) {
        if (_state.value.busy) return
        if (uri == null) {
            _state.value = _state.value.copy(message = "请先选择 Obsidian 库或待办目录")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, message = "正在读取本地 Markdown…")
            runCatching { withContext(Dispatchers.IO) {
                val index = repository.index(uri)
                val blocks = book.load(uri)
                val root = store.todoRoot(uri).document
                val canvasFile = root.findFile("白板")?.findFile("任务白板.canvas")
                val canvas = canvasFile?.let { store.read(it, "白板/任务白板.canvas").raw } ?: "{}"
                JSONObject(canvas)
                val objects = root.findFile("长期对象")?.listFiles()?.filter { it.name?.endsWith(".md") == true }
                    ?.map { it.name!!.removeSuffix(".md") to store.read(it, it.name!!).raw } ?: emptyList()
                val journal = book.dailyText(uri, _state.value.day)
                Triple(index, blocks, Triple(canvas, objects, journal))
            } }
                .onSuccess { (index, blocks, extras) ->
                    val reminders = prefs.getBoolean("reminders", false)
                    Reminders.schedule(getApplication(), if(reminders) blocks else emptyList())
                    _state.value = _state.value.copy(
                        blocks = blocks, canvas = extras.first, objects = extras.second, journal = extras.third,
                        remindersEnabled = reminders,
                        tasks = index.tasks,
                        duplicateCount = index.duplicateIds.size,
                        rootLabel = index.rootLabel,
                        busy = false,
                        message = confirmation ?: buildString {
                            append("已加载 ${index.tasks.size} 条待办")
                            if (index.shadowCopyCount > 0) append("；忽略 ${index.shadowCopyCount} 个同步影子副本")
                            if (index.duplicateIds.isNotEmpty()) append("；${index.duplicateIds.size} 个重复 ID 已设为只读")
                        }
                    )
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(busy = false, message = "加载失败：${error.message}")
                }
        }
    }

    fun setLayer(layer: TodoLayer?) {
        _state.value = _state.value.copy(selectedLayer = layer)
    }

    fun setQuery(value: String) {
        _state.value = _state.value.copy(query = value)
    }

    fun toggleDone(task: TodoTask) {
        if (_state.value.busy) return
        val uri = treeUri ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, message = "正在写回 ${task.title}…")
            runCatching {
                withContext(Dispatchers.IO) { repository.setDone(uri, task, task.done != true) }
            }.onSuccess { updated ->
                _state.value = _state.value.copy(
                    tasks = _state.value.tasks.map { current ->
                        if (current.relativePath == updated.relativePath) updated else current
                    },
                    busy = false,
                    message = if (updated.done == true) "已完成：${updated.title}" else "已恢复：${updated.title}"
                )
            }.onFailure { error ->
                _state.value = _state.value.copy(
                    busy = false,
                    message = "写回失败：${error.message}"
                )
            }
        }
    }

    fun day(day: LocalDate) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(day = day)
        refresh()
    }
    fun reminders(enabled: Boolean) {
        prefs.edit().putBoolean("reminders", enabled).apply()
        _state.value = _state.value.copy(remindersEnabled = enabled)
        Reminders.schedule(getApplication(), if(enabled) state.value.blocks else emptyList())
    }
    private fun mutation(action: (Uri) -> String) {
        if (_state.value.busy) return
        val uri = treeUri ?: return
        _state.value = _state.value.copy(busy = true)
        viewModelScope.launch {
            val result = runCatching { withContext(Dispatchers.IO) { action(uri) } }
            _state.value = _state.value.copy(busy = false)
            result.onSuccess { refresh(confirmation = it) }.onFailure { _state.value = _state.value.copy(message = it.message ?: "操作失败") }
        }
    }
    fun saveBlock(block: TimeBlock) = mutation { book.save(it, block); "已保存" }
    fun startTask(task: TodoTask) = mutation { uri ->
        check(book.load(uri).none { it.running }) { "已有活动正在计时，请先结束或暂停" }
        book.save(uri, TimeBlock(title = task.title, start = System.currentTimeMillis(), taskId = task.id, running = true))
        "已开始"
    }
    fun stop(block: TimeBlock) = saveBlock(block.revision().copy(end = System.currentTimeMillis(), running = false))
    fun resumeBlock(block: TimeBlock) = mutation { uri ->
        check(book.load(uri).none { it.running }) { "请先结束当前计时" }
        book.save(uri, TimeBlock(title = block.title, category = block.category, taskId = block.taskId, start = System.currentTimeMillis(), running = true))
        "已继续计时"
    }
    fun quickNote(title: String) = mutation { uri ->
        require(title.isNotBlank()) { "请输入任务名称" }
        val root = store.todoRoot(uri).document
        val workbench = root.findFile("缓存工作台") ?: error("缺少工作台目录")
        val inbox = workbench.findFile("收集箱") ?: workbench.createDirectory("收集箱") ?: error("不能创建收集箱")
        val name = title.trim().replace(Regex("[\\\\/:*?\"<>|]"), "-")+".md"
        check(inbox.findFile(name) == null) { "同名任务已存在" }
        val f = inbox.createFile("text/markdown", name) ?: error("无法创建任务")
        val raw = "---\nfourLayerTodo: true\nid: \"${java.util.UUID.randomUUID()}\"\ndone: false\nsortKey: ${System.currentTimeMillis()}\n---\n\n"
        getApplication<Application>().contentResolver.openOutputStream(f.uri, "wt")!!.use { it.write(raw.toByteArray()) }
        check(store.read(f, name).raw == raw) { "新任务校验失败，请刷新" }; "已加入收集箱"
    }
    fun editTask(task: TodoTask, body: String) = mutation { uri ->
        check(!task.readOnlyConflict) { "冲突任务只能读取" }
        val old = store.findMarkdown(uri, task.relativePath)
        check(old.hash == task.sourceHash) { "任务已变化，请刷新" }
        val header = Regex("^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n?").find(old.raw) ?: error("无效任务")
        store.updateMarkdown(old, header.value+"\n"+body+"\n"); "已保存正文"
    }
    fun moveTask(task: TodoTask, destination: String) = mutation { uri ->
        check(!task.readOnlyConflict) { "冲突任务不能移动" }
        val old = store.findMarkdown(uri, task.relativePath)
        check(old.hash == task.sourceHash) { "任务已变化，请刷新" }
        val root = store.todoRoot(uri).document
        var target = root
        destination.split('/').forEach { part ->
            require(part.isNotBlank() && part !in listOf(".", ".."))
            target = target.findFile(part) ?: target.createDirectory(part) ?: error("不能创建目标目录")
        }
        check(target.findFile(old.document.name!!) == null) { "目标已有同名文件" }
        val parent = old.document.parentFile ?: error("无法访问源目录")
        val moved = android.provider.DocumentsContract.moveDocument(getApplication<Application>().contentResolver, old.document.uri, parent.uri, target.uri)
        check(moved != null) { "文件提供方不支持移动；源文件保留" }; "已移动"
    }
    fun exportDay() = mutation { book.exportDay(it, state.value.day) }
    fun saveCanvas(json: String, expected: String) = mutation { uri ->
        val root = store.todoRoot(uri).document.findFile("白板") ?: error("没有白板目录")
        val file = root.findFile("任务白板.canvas")
        if (file == null) error("先在 Obsidian 打开白板生成 Canvas，再保存布局")
        val old = store.read(file, "白板/任务白板.canvas")
        check(old.raw == expected) { "白板已在另一设备修改，请刷新后再调整" }
        store.updateMarkdown(old, json); "布局已保存"
    }
}
