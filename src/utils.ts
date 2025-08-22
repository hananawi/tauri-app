import { invoke } from "@tauri-apps/api/core";

export const sleep = (ms: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
};

export const setup = async () => {
  // Fake perform some really heavy setup task
  console.log("Performing really heavy frontend setup task...");

  await sleep(3000);

  // Set the frontend task as being completed
  invoke("set_complete", { task: "frontend" });
};
