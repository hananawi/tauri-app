import "@testing-library/jest-dom/vitest";

// jsdom 不实现 scrollIntoView，但 LlmResultPage 里用它把视图滚到底部。
Element.prototype.scrollIntoView = () => {};

