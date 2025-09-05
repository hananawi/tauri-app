import { Button } from "@headlessui/react";
import { invoke } from "@tauri-apps/api/core";

export const OcrPage = () => {
  const handleClick = () => {
    invoke("detect_text");
  };

  return (
    <div className="flex justify-center items-center">
      <Button onClick={handleClick}>Detect Text</Button>
    </div>
  );
};
