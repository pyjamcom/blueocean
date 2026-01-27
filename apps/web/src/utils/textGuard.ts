export function startTextGuard(root: HTMLElement = document.body) {
  const isTextNode = (node: Node) =>
    node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0;

  const scan = (node: Node) => {
    if (isTextNode(node)) {
      console.warn("UI text node detected", node.textContent);
    }
    node.childNodes.forEach((child) => scan(child));
  };

  scan(root);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => scan(node));
      if (mutation.type === "characterData" && isTextNode(mutation.target)) {
        console.warn("UI text node detected", mutation.target.textContent);
      }
    });
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return () => observer.disconnect();
}
