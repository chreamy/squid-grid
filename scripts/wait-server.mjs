for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch("http://127.0.0.1:5173")).ok) process.exit(0);
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
throw new Error("Preview server failed to start");
