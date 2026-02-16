# Sound Packs

Drop mp3 files into each pack directory. Filenames must match exactly:

```
sounds/
  opencode/          <-- default pack
    completion.mp3   <-- plays when AI finishes a task
    error.mp3        <-- plays on session error
    notification.mp3 <-- plays for questions / permission requests
    send.mp3         <-- plays when user sends a message
  kortix/            <-- Kortix branded pack
    completion.mp3
    error.mp3
    notification.mp3
    send.mp3
```

If an mp3 is missing, the app falls back to a synthesised tone.
