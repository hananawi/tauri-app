use objc2::rc::Retained;
use objc2_foundation::{NSArray, NSString};

use crate::ocr::OcrOptions;

pub struct Objc2Options {
    pub target_languages: Retained<NSArray<NSString>>,
}

pub fn convert_options(options: OcrOptions) -> Objc2Options {
    let target_languages: Retained<NSArray<NSString>> = options
        .target_languages
        .into_iter()
        .map(|s| NSString::from_str(&s))
        .collect();

    Objc2Options { target_languages }
}
