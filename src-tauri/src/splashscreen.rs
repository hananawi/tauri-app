// use std::{sync::Mutex, time::Duration};

// use tauri::{AppHandle, Manager};
// use tokio::time::sleep;

// pub struct SetupState {
//     pub frontend_task: bool,
//     pub backend_task: bool,
// }

// // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// #[tauri::command]
// pub fn greet(name: &str) -> String {
//     format!("Hello, {}! You've been greeted from Rust!", name)
// }

// #[tauri::command]
// pub async fn set_complete(
//     app: AppHandle,
//     state: tauri::State<'_, Mutex<SetupState>>,
//     task: String,
// ) -> Result<(), ()> {
//     let mut state_lock = state.lock().unwrap();
//     match task.as_str() {
//         "frontend" => state_lock.frontend_task = true,
//         "backend" => state_lock.backend_task = true,
//         _ => panic!("invalid task completed!"),
//     }

//     if state_lock.frontend_task && state_lock.backend_task {
//         let splash_window = app.get_webview_window("splashscreen").unwrap();
//         let main_window = app.get_webview_window("main").unwrap();

//         splash_window.close().unwrap();
//         main_window.show().unwrap();
//     }

//     Ok(())
// }

// pub async fn setup(app: AppHandle) -> Result<(), ()> {
//     println!("Performing really heavy backend setup task...");
//     sleep(Duration::from_secs(3)).await;
//     println!("Backend setup task completed!");

//     set_complete(app.clone(), app.state(), "backend".to_string()).await?;

//     Ok(())
// }
