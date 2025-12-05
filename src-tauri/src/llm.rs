use crate::http_client::HttpClient;
use serde::{Deserialize, Serialize};

use tauri::{Runtime, State};

#[tauri::command]
async fn gen_audio_from_text<R: Runtime>(
  text: String,
  state: State<'_, HttpClient>,
) -> Result<(), Box<dyn std::error::Error>> {
  #[derive(Debug, Deserialize, Serialize)]
  struct ReqBody {}
  #[derive(Debug, Deserialize, Serialize)]
  struct ResBody {}

  let req_body = ReqBody {};

  let res_body: ResBody = state
    .client()
    .post("url")
    .json(&req_body)
    .send()
    .await?
    .json()
    .await?;

  println!("request sent with reqBody: {req_body:#?}");
  println!("response received with resBody: {res_body:#?}");

  Ok(())
}
