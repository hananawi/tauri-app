use crate::http_client::HttpClient;
use serde_json::Value;

use tauri::State;

#[tauri::command]
pub async fn gen_audio_from_text(
  text: String,
  state: State<'_, HttpClient>,
) -> Result<(), String> {
  let client = state.client();

  let query_json: Value = client
    .post("https://float-ceremony-enquiry-fully.trycloudflare.com/audio_query")
    .query(&[("speaker", "1"), ("text", text.as_str())])
    .send()
    .await
    .map_err(|e| e.to_string())?
    .json()
    .await
    .map_err(|e| e.to_string())?;

  println!("{query_json:#?}");

  let audio_bytes = client
    .post("https://float-ceremony-enquiry-fully.trycloudflare.com/synthesis")
    .query(&[("speaker", "1")])
    .json(&query_json)
    .send()
    .await
    .map_err(|e| e.to_string())?
    .bytes()
    .await
    .map_err(|e| e.to_string())?;

  println!("request sent");
  // println!("response received with resBody: {res_body:#?}");
  std::fs::write("audio.wav", &audio_bytes).map_err(|e| e.to_string())
}
