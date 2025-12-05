use tauri_plugin_http::reqwest;

pub struct HttpClient {
  client: reqwest::Client,
}

impl HttpClient {
  pub fn new() -> Self {
    let client = reqwest::Client::builder()
      .build()
      .expect("build http client failed");

    Self { client }
  }

  pub fn client(&self) -> reqwest::Client {
    self.client.clone()
  }
}
