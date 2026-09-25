(() => {
  const note = document.querySelector(".offline-note");
  const nodes = document.querySelectorAll("pre.mermaid");
  if (!nodes.length) return;

  if (!window.mermaid) {
    if (note) note.classList.add("visible");
    return;
  }

  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    flowchart: { htmlLabels: false, curve: "basis" },
    themeVariables: {
      primaryColor: "#d8ebe7",
      primaryTextColor: "#18211f",
      primaryBorderColor: "#0f766e",
      lineColor: "#60706b",
      secondaryColor: "#f4e4c8",
      tertiaryColor: "#eef1ef"
    }
  });

  window.mermaid.run({ nodes }).catch(() => {
    if (note) note.classList.add("visible");
  });
})();

