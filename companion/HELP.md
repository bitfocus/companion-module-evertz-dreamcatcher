# DreamCatcher Companion Module

## Configuration

Set the DreamCatcher connection information:

- Host IP Address
- TCP Port (default 5001)
- Username

After connecting, press **Refresh Connection** to populate outputs, inputs, sessions, clips, playlists, and export profiles.

---

## Features

### Playback Control

- Play at variable speed (forward, reverse, slow motion)
- Pause
- Goto Live
- Goto In / Goto Out
- Scrub forward and backward by frames
- Scrub using a physical encoder knob (configurable frames per tick)
- Variable playspeed control via encoder knob (dial up/down in steps)
- Next Clip (advance to next clip in playlist)
- Skip Next Clip (skip over the next clip to the one after)
- Set Output Idle / Black

### Clip Workflow

- Mark In / Mark Out
- Create Clip
- Recall Last Clip
- Cue or Play clip by Page / Bank / Slot / Angle (PBS)
- Cue or Play session clip by PBS
- Cue or Play clip by name from a dropdown of all system clips
- Cue or Play session clip from a session-filtered dropdown
- Create Meta Mark at current output timecode (tagged with operator username)

### Playlist Control

- Cue or Play local playlist from a dropdown
- Cue or Play session playlist from a dropdown
- Refresh Playlists (local and session, runs automatically on connect)

### Input Routing

- Refresh Inputs
- Route Input to Output

### Mosaic Control

- Custom Mosaic (2-box, 3-box, 4-box layouts)
- Clear Mosaic

### Capture Control

- Start Capture
- Stop Capture

### System Control

- Refresh Connection (outputs, inputs, sessions, clips, playlists)
- Refresh Outputs / Inputs / Bins / Export Profiles / Sessions / Clips / Playlists
- Restart Inputs / Outputs / AMP / VUE
- Restart All Components
- Restart Database
- Reboot Server

---

## Feedbacks

Feedbacks update button colours and text automatically based on live DreamCatcher state.

### Output Feedbacks

- **Output Playing — Simple** — button colour reflects playspeed: green (100%), yellow (1–99%), red (0%). Shows output name and speed.
- **Output Status — Full** — shows output name, clip or playlist name, and time remaining on the button. Green / yellow / red / blue (live input) by playspeed.

### System Monitor Feedbacks

- **Ping** — green with response time in ms when connected, red on timeout
- **Record Time Remaining** — shows H:MM:SS of remaining record time, colour-coded by configurable thresholds
- **NAS Status** — per-mount dropdown showing CONNECTED or OFFLINE for each NAS
- **Timecode Display** — shows current system time as HH:MM:SS from the Montage output, updates every 500ms
