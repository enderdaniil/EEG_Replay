class TabManager {
  constructor(onChange) {
    this.onChange = onChange;
    this.main = "individual";
    this.sub = "rhythms";

    this.mainBtns = document.querySelectorAll(".main-tabs .tab-btn");
    this.subBtns = document.querySelectorAll(".sub-tabs .sub-tab-btn");

    this.mainBtns.forEach(btn => {
      btn.addEventListener("click", () => this.setMain(btn.dataset.tab));
    });
    this.subBtns.forEach(btn => {
      btn.addEventListener("click", () => this.setSub(btn.dataset.subtab));
    });
  }

  setMain(tab) {
    this.main = tab;
    this.mainBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    this.onChange?.(this.main, this.sub);
  }

  setSub(sub) {
    this.sub = sub;
    this.subBtns.forEach(b => b.classList.toggle("active", b.dataset.subtab === sub));
    this.onChange?.(this.main, this.sub);
  }

  set(main, sub, silent = false) {
    this.main = main || this.main;
    this.sub = sub || this.sub;
    this.mainBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === this.main));
    this.subBtns.forEach(b => b.classList.toggle("active", b.dataset.subtab === this.sub));
    if (!silent) this.onChange?.(this.main, this.sub);
  }
}
