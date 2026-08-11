// Keeps the sidebar controls visible at every viewport height.
// Only the 527-question number grid should scroll vertically.
const sidebarFixStyle = document.createElement("style");
sidebarFixStyle.textContent = `
  .sidebar{
    min-height:0;
    overflow:hidden;
    gap:12px;
  }

  .sidebar-head,
  .sidebar-progress,
  .search-wrap,
  .nav-tools,
  .legend,
  .sidebar-actions{
    flex:0 0 auto;
  }

  .question-grid{
    flex:1 1 auto;
    min-height:0;
    overflow-y:auto;
    overscroll-behavior:contain;
    padding-bottom:4px;
  }

  .sidebar-actions{
    margin-top:0;
    padding-top:4px;
    padding-bottom:max(0px, env(safe-area-inset-bottom));
    background:var(--surface);
    position:relative;
    z-index:2;
  }

  /* On short desktop/laptop screens compress non-essential vertical spacing
     instead of pushing the Home button below the viewport. */
  @media (min-width:901px) and (max-height:820px){
    .sidebar{padding:14px;gap:9px}
    .sidebar-head strong{font-size:14px}
    .sidebar-progress{gap:5px}
    .legend{gap:4px 8px}
    .search-box{height:38px}
    .jump-box{gap:3px}
    .jump-box input{height:34px}
    .btn.tiny{min-height:34px}
    .sidebar-actions{gap:6px;padding-top:2px}
    .sidebar-actions .btn{min-height:38px}
    .qnav{border-radius:7px;font-size:10px}
  }

  @media (max-width:900px){
    .sidebar{
      height:100dvh;
      max-height:100dvh;
      padding-bottom:calc(14px + env(safe-area-inset-bottom));
    }
    .sidebar-actions{padding-bottom:0}
  }
`;
document.head.appendChild(sidebarFixStyle);
