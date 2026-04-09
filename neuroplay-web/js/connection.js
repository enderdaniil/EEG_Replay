class ConnectionManager {
  constructor() {
    this.state = "disconnected"; // disconnected, connecting, connected, searching, error
  }

  setState(state) {
    this.state = state;
    const root = document.getElementById("connectionStatus");
    const ind = root.querySelector(".status-indicator");
    const text = root.querySelector(".status-text");

    ind.classList.remove("connected", "connecting");
    if (state === "connected") {
      ind.classList.add("connected");
      text.textContent = "Подключено";
    } else if (state === "connecting") {
      ind.classList.add("connecting");
      text.textContent = "Подключение...";
    } else if (state === "searching") {
      ind.classList.add("connecting");
      text.textContent = "Поиск устройств...";
    } else if (state === "error") {
      text.textContent = "Ошибка";
    } else {
      text.textContent = "Отключено";
    }
  }

  get isConnected() {
    return this.state === "connected";
  }
}
