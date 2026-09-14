package com.obsidiancodx.fourlayertodo

import android.app.Application
import com.obsidiancodx.fourlayertodo.data.TodoRepository

class FourLayerTodoApplication : Application() {
    val repository by lazy { TodoRepository(this) }
}
