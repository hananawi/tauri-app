use tauri_plugin_http::reqwest;

pub struct HttpClient {
  client: reqwest::Client,
}

impl HttpClient {
  pub fn new() -> Self {
    let client = reqwest::Client::builder()
      // 读系统钥匙串根证书，而非 rustls 内置 webpki-roots，避免真实证书链 UnknownIssuer。
      .tls_built_in_native_certs(true)
      .build()
      .expect("build http client failed");

    Self { client }
  }

  pub fn client(&self) -> reqwest::Client {
    self.client.clone()
  }
}
