const { createApp } = window.Vue;

createApp({
  data() {
    return {
      name: "",
      message: "Page loaded",
      wantsUpdates: false,
      theme: "light",
    };
  },
  methods: {
    greet() {
      const displayName = this.name.trim() || "friend";
      this.message = `Hello, ${displayName}!`;
    },
  },
}).mount("#app");
