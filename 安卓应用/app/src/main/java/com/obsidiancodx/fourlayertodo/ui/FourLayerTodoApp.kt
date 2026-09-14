package com.obsidiancodx.fourlayertodo.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import com.obsidiancodx.fourlayertodo.MainViewModel
import com.obsidiancodx.fourlayertodo.TodoUiState
import com.obsidiancodx.fourlayertodo.model.TodoLayer
import com.obsidiancodx.fourlayertodo.model.TodoTask

private val AppBackground = Color(0xFFF4F7F2)
private val Brand = Color(0xFF456B5B)
private val CardBackground = Color(0xFFFFFDF7)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FourLayerTodoApp(viewModel: MainViewModel) {
    val state by viewModel.state.collectAsState()
    val folderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        uri?.let(viewModel::selectVault)
    }

    MaterialTheme {
        Scaffold(
            containerColor = AppBackground,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("四层待办", fontWeight = FontWeight.SemiBold)
                            if (state.rootLabel.isNotBlank()) {
                                Text(
                                    state.rootLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    },
                    actions = {
                        TextButton(onClick = viewModel::refresh, enabled = !state.busy) { Text("刷新") }
                        TextButton(onClick = { folderPicker.launch(null) }) { Text("目录") }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = AppBackground)
                )
            }
        ) { padding ->
            if (viewModel.treeUri == null && state.tasks.isEmpty()) {
                EmptyVault(
                    message = state.message,
                    onChoose = { folderPicker.launch(null) },
                    modifier = Modifier.padding(padding)
                )
            } else {
                TodoContent(
                    state = state,
                    onQuery = viewModel::setQuery,
                    onLayer = viewModel::setLayer,
                    onToggle = viewModel::toggleDone,
                    onChoose = { folderPicker.launch(null) },
                    modifier = Modifier.padding(padding)
                )
            }
        }
    }
}

@Composable
private fun EmptyVault(message: String, onChoose: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(32.dp)
        ) {
            Text("✓", color = Brand, style = MaterialTheme.typography.displayLarge)
            Text("直接读取你的 Obsidian 待办", style = MaterialTheme.typography.headlineSmall)
            Text(
                "任务仍保存在 Markdown 中。App 只通过 Android 系统授权访问你选择的目录，不上传到网络。",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF59625D)
            )
            TextButton(onClick = onChoose) { Text("选择 Obsidian 库") }
            Text(message, style = MaterialTheme.typography.labelMedium, color = Color(0xFF6D756F))
        }
    }
}

@Composable
private fun TodoContent(
    state: TodoUiState,
    onQuery: (String) -> Unit,
    onLayer: (TodoLayer?) -> Unit,
    onToggle: (TodoTask) -> Unit,
    onChoose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val query = state.query.trim()
    val visible = state.tasks.filter { task ->
        (state.selectedLayer == null || task.layer == state.selectedLayer) &&
            (query.isBlank() || listOf(task.title, task.detail, task.poolTitle.orEmpty(), task.relativePath)
                .any { it.contains(query, ignoreCase = true) })
    }

    Column(modifier.fillMaxSize()) {
        if (state.busy) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth().height(3.dp), color = Brand)
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            StatusCard(state, onChoose)
            OutlinedTextField(
                value = state.query,
                onValueChange = onQuery,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("搜索标题、详情或任务池") },
                shape = RoundedCornerShape(18.dp)
            )
            LayerFilters(state, onLayer)
        }
        if (visible.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("这一层暂时没有匹配的待办", color = Color(0xFF6D756F))
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(visible, key = { it.relativePath }) { task ->
                    TodoCard(task, state.busy, onToggle)
                }
            }
        }
    }
}

@Composable
private fun StatusCard(state: TodoUiState, onChoose: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFE4EDE7)),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(state.message, style = MaterialTheme.typography.bodySmall, color = Color(0xFF385044))
                val active = state.tasks.count { it.done != true }
                Text("${state.tasks.size} 条 · $active 条未完成", style = MaterialTheme.typography.labelSmall)
            }
            TextButton(onClick = onChoose) { Text("目录") }
        }
    }
}

@Composable
private fun LayerFilters(state: TodoUiState, onLayer: (TodoLayer?) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        FilterChip(
            selected = state.selectedLayer == null,
            onClick = { onLayer(null) },
            label = { Text("全部 ${state.tasks.size}") }
        )
        TodoLayer.entries.forEach { layer ->
            val count = state.tasks.count { it.layer == layer }
            FilterChip(
                selected = state.selectedLayer == layer,
                onClick = { onLayer(layer) },
                label = { Text("${layer.label} $count") }
            )
        }
    }
}

@Composable
private fun TodoCard(task: TodoTask, busy: Boolean, onToggle: (TodoTask) -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = CardBackground),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Checkbox(
                checked = task.done == true,
                onCheckedChange = { onToggle(task) },
                enabled = !busy && !task.readOnlyConflict
            )
            Column(Modifier.weight(1f).padding(top = 5.dp, end = 4.dp)) {
                Text(
                    task.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    textDecoration = if (task.done == true) TextDecoration.LineThrough else TextDecoration.None,
                    color = if (task.done == true) Color(0xFF7A817C) else Color(0xFF222723)
                )
                Spacer(Modifier.height(6.dp))
                val metadata = listOfNotNull(task.layer.label, task.priority, task.poolTitle)
                    .joinToString(" · ")
                Text(
                    metadata,
                    style = MaterialTheme.typography.labelMedium,
                    color = Brand,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (task.readOnlyConflict) {
                    Text("ID 冲突 · 只读", color = Color(0xFFAA3E35), style = MaterialTheme.typography.labelMedium)
                }
                if (task.detail.isNotBlank()) {
                    Text(
                        task.detail.replace(Regex("\\s+"), " "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFF59625D),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 5.dp)
                    )
                }
                Text(
                    task.relativePath,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF8A918C),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 7.dp)
                )
            }
        }
    }
}
