# Evertz DreamCatcher Companion Module

Companion control module for Evertz DreamCatcher replay systems.

This module provides operator-focused control of DreamCatcher outputs, replay workflows, capture control, routing, mosaic layouts, session-based clip recall, playlist control, system monitoring, and system maintenance directly from Bitfocus Companion.

---

# Start Here: Refresh Connection

## Refresh Connection

Use **Refresh Connection** after connecting to DreamCatcher, after changing sessions, or any time Companion dropdowns look empty or stale.

This button refreshes the information Companion needs from the server, including:

- Outputs
- Inputs
- Bins
- Export profiles
- Sessions
- Clip names for the selected/default session
- Local and session playlists

Recommended workflow:

1. Connect the module to DreamCatcher.
2. Press **Refresh Connection**.
3. Confirm your output, session, source, and playlist dropdowns are populated.
4. Use the cue/play/clip workflow actions as needed.

If a dropdown does not show the expected information, press **Refresh Connection** first before troubleshooting individual actions.

---

# Configuration

## DreamCatcher IP

IP address of the DreamCatcher system.

Example:

```text
10.16.8.100
```

## Port

TCP control port used by DreamCatcher.

Default:

```text
5001
```

## Username

Operator name used for session control, PBS/readable ID workflows, and meta mark creation.

Example:

```text
Operator
```

---

# Actions

## Clear Mosaic Layout

Clears the custom mosaic layout from the selected output.

Use when:

- Returning an output to a normal full-screen view
- Clearing a split-screen or multi-box monitoring layout
- Resetting an output after using a mosaic preset

---

## Create Clip

Creates a clip from the current marked In and Out points on the selected output.

Options:

- Output
- Clip Name Template
- Optional Readable ID

Use when:

- Saving a replay
- Creating a highlight
- Building a clip for later recall

---

## Create Meta Mark

Creates a meta mark at the current timecode of the selected output. The creator is set to the logged-in username configured in the module settings.

Options:

- Output (used to read current timecode position)
- Mark Name

Use when:

- Marking a moment in the timeline for later reference
- Tagging significant plays or events during a live session
- Building a bookmark list for editorial review

---

## Cue Clip by Page / Bank / Slot / Angle

Finds a clip using the standard Page / Bank / Slot / Angle format and cues it to the selected output.

Options:

- Output
- Page
- Bank
- Slot
- Angle
- Cue Speed

Use when:

- Loading a clip without immediately playing it
- Preparing a replay for manual playback
- Calling up a clip from the broader clip database using PBS-style addressing

Example:

```text
Page 1 / Bank 1 / Slot 4 / Angle A
```

---

## Cue Clip Name Dropdown

Cues a clip at 0% speed using a dropdown list of all clips on the system. The clip list is loaded automatically on connect and can be refreshed with **Refresh All Clips**.

Options:

- Output
- Clip (dropdown)

Use when:

- You want to browse and select a clip by name
- You are not using PBS-style addressing
- You want to prepare a clip before playing it

---

## Cue Playlist Dropdown

Cues a local playlist at 0% speed from a dropdown of all playlists on the system.

Options:

- Output
- Playlist (dropdown)

Use when:

- Loading a playlist without immediately playing it
- Preparing a playlist for manual playback

---

## Cue Session Clip by PBS

Finds a clip inside a selected session using Page / Bank / Slot / Angle and cues it to the selected output.

Options:

- Output
- Session
- Page
- Bank
- Slot
- Angle
- Cue Speed

Use when:

- You know the PBS location of the clip
- You want to limit the search to one session
- You do not want to refresh or browse the full clip dropdown

Recommended workflow:

1. Press **Refresh Connection** or **Refresh Sessions**.
2. Select the correct session.
3. Enter the Page / Bank / Slot / Angle.
4. Trigger **Cue Session Clip by PBS**.

---

## Cue Session Clip Dropdown

Cues a clip from a specific session's clip list at 0% speed using a dropdown.

Options:

- Output
- Session
- Clip (dropdown)

Use when:

- You want to browse clips within a specific session by name
- You want to cue without immediately playing

---

## Cue Session Playlist Dropdown

Cues a playlist from a specific session at 0% speed.

Options:

- Output
- Session
- Playlist (dropdown)

Use when:

- Loading a session-specific playlist before playing
- Working within a defined session context

---

## Goto In

Moves the selected output to the current In mark.

Options:

- Output

---

## Goto Live

Returns the selected output to live capture.

Options:

- Output

---

## Goto Out

Moves the selected output to the current Out mark.

Options:

- Output

---

## Mark In

Sets the In point on the selected output.

Options:

- Output

---

## Mark Out

Sets the Out point on the selected output.

Options:

- Output

---

## Next Clip

Advances playback to the next clip in a playlist on the selected output.

Options:

- Output

Use when:

- Playing through a playlist manually
- Stepping forward through a sequence of clips

---

## Pause

Pauses playback on the selected output.

Options:

- Output

---

## Play

Starts playback on the selected output at the selected speed.

Options:

- Output
- Speed

Playback speed examples:

```text
100 = normal speed
50 = half speed
200 = double speed
-100 = reverse playback
```

---

## Play Clip by Page / Bank / Slot / Angle

Finds a clip using Page / Bank / Slot / Angle and immediately plays it.

Options:

- Output
- Page
- Bank
- Slot
- Angle

---

## Play Clip Name Dropdown

Cues and immediately plays a clip at 100% using a dropdown list of all clips on the system.

Options:

- Output
- Clip (dropdown)

Use when:

- You want a one-button clip selection and roll
- You are browsing clips by name

---

## Play Playlist Dropdown

Cues and plays a local playlist at 100% from a dropdown.

Options:

- Output
- Playlist (dropdown)

---

## Play Session Clip by PBS

Finds a clip inside the selected session using Page / Bank / Slot / Angle and immediately plays it.

Options:

- Output
- Session
- Page
- Bank
- Slot
- Angle

---

## Play Session Clip Dropdown

Cues and plays a clip from a specific session's clip list at 100%.

Options:

- Output
- Session
- Clip (dropdown)

---

## Play Session Playlist Dropdown

Cues and plays a playlist from a specific session at 100%.

Options:

- Output
- Session
- Playlist (dropdown)

---

## Playspeed Down (Encoder / Knob)

Decreases the playspeed of the selected output by a configurable step per knob tick. Reads the current playspeed and steps down from it.

Options:

- Output
- Speed step per tick (%)

Use when:

- Using a physical knob to dial down replay speed
- Gradually slowing from full speed to slow motion

---

## Playspeed Up (Encoder / Knob)

Increases the playspeed of the selected output by a configurable step per knob tick.

Options:

- Output
- Speed step per tick (%)

Use when:

- Using a physical knob to increase replay speed
- Ramping back up from slow motion to full speed

---

## Raw JSON-RPC

Advanced manual command tool for testing or troubleshooting. Recommended for advanced users only.

---

## Reboot Server

Reboots the DreamCatcher server. This is a high-impact action. Use carefully.

---

## Recall Last Clip

Cues the most recently created clip to the selected output.

Options:

- Output
- Cue Speed

---

## Refresh All Clips

Reloads the clip name dropdown list from the system (up to 1000 clips). Runs automatically on connect.

Use when:

- New clips have been created since the last refresh
- The clip name dropdown is empty or outdated

---

## Refresh Bins

Refreshes available bins for Companion dropdowns.

---

## Refresh Export Profiles

Refreshes available export profiles for Companion dropdowns.

---

## Refresh Inputs

Refreshes available input sources for Companion dropdowns.

---

## Refresh Outputs

Refreshes available DreamCatcher outputs for Companion dropdowns.

---

## Refresh Playlists

Reloads both local playlists and session playlists. Runs automatically on connect.

Options:

- Session (optional — if provided, also loads playlists for that session)

Use when:

- New playlists have been created
- Playlist dropdowns are empty or outdated
- You have switched sessions and need session playlists to update

---

## Refresh Session Clips

Refreshes clip names for the selected session.

Options:

- Session

---

## Refresh Sessions

Refreshes the list of available sessions.

---

## Restart Database

Clears and restarts the DreamCatcher database service.

Use when:

- Directed by engineering or support
- Recovering from database-related issues

---

## Restart System Components

Restarts selected DreamCatcher system components.

Options:

- Restart Inputs
- Restart Outputs
- Restart AMP Connections
- Restart VUE
- Confirm Restart

The confirmation checkbox is included to reduce accidental restarts.

---

## Route Input to Output

Routes a selected input source to a selected output.

Options:

- Input
- Output

---

## Scrub

Moves playback forward or backward by a specific number of frames.

Options:

- Output
- Frames (positive = forward, negative = backward)

---

## Scrub (Encoder / Knob)

Scrubs the selected output forward by a configurable number of frames per knob tick. Assign to the rotate-right action of an encoder button. Use negative values to scrub backward.

Options:

- Output
- Frames per tick (negative = backwards)

---

## Scrub Back (Encoder / Knob)

Scrubs the selected output backward by a configurable number of frames per knob tick. Assign to the rotate-left action of an encoder button.

Options:

- Output
- Frames per tick (negative = backwards, default -5)

---

## Set Custom Mosaic Layout

Creates a custom multi-box mosaic layout on the selected output.

Options include:

- Output
- Number of boxes
- Border thickness and color
- Input/source for each box
- Crop and screen placement per box

Supported layouts: 2 box, 3 box, 4 box

---

## Set Output Idle / Black

Sets the selected output to idle/black.

Options:

- Output

---

## Skip Next Clip

Skips the next clip in a playlist and jumps to the clip after it.

Options:

- Output

Use when:

- You want to skip over a clip without playing it
- Advancing past an unwanted clip in a sequence

---

## Start Capture

Starts capture/recording.

---

## Stop Capture

Stops capture/recording.

---

# Feedbacks

Feedbacks dynamically change the colour and/or text of a button based on the live state of DreamCatcher. Add them to any button in Companion's button editor.

---

## Output Playing — Simple Green/Yellow/Red

Changes the background colour of a button based on the current playspeed of the selected output.

Options:

- Output
- Colour when playing at 100% (default green)
- Colour when playing at 1–99% (default yellow)
- Colour when stopped at 0% (default red)

Also shows the output name and current speed percentage as button text.

Update rate: every 500ms

---

## Output Status — Name + Time Remaining

Provides a full status display on a button showing the output name, the current clip or playlist name (up to 15 characters), and the time remaining. Clip and playlist names are fetched automatically.

- Green = playing at 100%
- Yellow = playing at 1–99%
- Red = stopped at 0%
- Blue = live input routed to output

The button text clears to show only the button's own label when the output is idle or has no status yet.

Update rate: every 500ms

---

## Ping — Connection Status

Measures the round-trip response time to DreamCatcher and displays it on the button.

- Green + response time in ms = connected
- Red + TIMEOUT = no response within 2 seconds
- Grey = waiting for first poll

Update rate: every 5 seconds

---

## Record Time Remaining

Shows the remaining recording time from DreamCatcher's storage system as H:MM:SS on the button.

Options:

- Warning threshold in minutes (default 60 — button turns yellow)
- Critical threshold in minutes (default 15 — button turns red)

Update rate: every 5 seconds

---

## NAS Status

Shows the connection status of a specific NAS mount. A dropdown lists all available mounts by their folder name.

Options:

- NAS Mount (dropdown — populates after first poll)

- Green + CONNECTED = mount is online
- Red + OFFLINE = mount is disconnected

Update rate: every 5 seconds

---

## Timecode Display — System Time

Shows the current system timecode as HH:MM:SS from the first Montage output. No configuration needed.

Update rate: every 500ms

---

# Preset Categories

## System

General refresh and discovery controls.

Includes:

- Refresh Connection
- Refresh Outputs
- Refresh Inputs
- Refresh Bins
- Refresh Export Profiles
- Refresh Sessions
- Refresh Session Clips
- Refresh All Clips
- Refresh Playlists
- Ping Monitor
- Record Time Remaining
- NAS Monitor
- Timecode Display

## System Restart

Restart and reboot controls.

Includes:

- Restart All Components
- Restart Inputs
- Restart Outputs
- Restart AMP
- Restart VUE
- Reboot Server
- Restart Database

## Output Control

Transport and output-position controls.

Includes:

- Play
- Pause
- Scrub
- Goto Live
- Goto In
- Goto Out
- Black Output
- Scrub Knob (encoder)
- Speed Knob (encoder)
- Next Clip
- Skip Next Clip
- Output Status (with full feedback)

## Clip Workflow

Clip marking and creation tools.

Includes:

- Mark In
- Mark Out
- Create Clip
- Recall Last Clip
- Create Meta Mark

## Clip Hotkeys

Clip recall tools using PBS addressing and name-based dropdowns.

Includes:

- Cue Clip by PBS
- Play Clip by PBS
- Cue Session Clip by PBS
- Play Session Clip by PBS
- Cue Clip Name Dropdown
- Play Clip Name Dropdown
- Cue Session Clip Dropdown
- Play Session Clip Dropdown

## Playlist Hotkeys

Playlist cue and play controls.

Includes:

- Cue Playlist Dropdown
- Play Playlist Dropdown
- Cue Session Playlist Dropdown
- Play Session Playlist Dropdown

## Mosaic

Mosaic layout controls.

Includes:

- 2 Box Mosaic
- 3 Box Mosaic
- 4 Box Mosaic
- Clear Mosaic

## Input Routing

Input-to-output routing controls.

Includes:

- Route Input to Output

## Multi-Output

Controls for multiple outputs at once.

Includes:

- Play First Two Outputs
- Black First Two Outputs
- Black All Outputs

## Capture Control

Capture start/stop controls.

Includes:

- Start Capture
- Stop Capture

---

# Live Update Rates

The module polls DreamCatcher automatically at the following intervals:

| Data | Rate |
|------|------|
| Output playspeed, clip ID, timecode | Every 500ms |
| Output state changes (clip/playlist changes) | Instant push from DreamCatcher |
| Record time remaining, ping | Every 5 seconds |
| NAS mount status | Every 5 seconds |
| Clip names (on demand) | When a new clip is seen on an output |
| Playlist names (on demand) | When a new playlist is seen on an output |

---

# Recommended Operator Workflow

## Before an event

1. Confirm the DreamCatcher IP, port, and username are correct.
2. Press **Refresh Connection**.
3. Confirm outputs, inputs, sessions, clips, and playlist dropdowns populate correctly.
4. Start capture if needed.

## During replay operation

Use:

- **Mark In**
- **Mark Out**
- **Create Clip**
- **Recall Last Clip**
- **Cue Session Clip by PBS** or **Cue Clip Name Dropdown**
- **Play Session Clip by PBS** or **Play Clip Name Dropdown**
- **Cue Playlist Dropdown** or **Play Playlist Dropdown**
- **Goto In**
- **Goto Out**
- **Goto Live**
- **Create Meta Mark** (to tag significant moments)

## Encoder / Knob workflows

- Use the **Scrub Knob** preset for frame-accurate scrubbing
- Use the **Speed Knob** preset to dial playspeed up and down with a physical knob
- Frames per tick and speed step are configurable in each action's options

## If dropdowns look wrong

Press:

```text
Refresh Connection
```

Then retry the action.

## If only sessions changed

Press:

```text
Refresh Sessions
```

## If only clip names changed

Press:

```text
Refresh Session Clips
```

or

```text
Refresh All Clips
```

## If playlists are not showing

Press:

```text
Refresh Playlists
```

---

# Notes

- **Refresh Connection** is the safest first troubleshooting step for stale dropdowns.
- Output actions require the correct output selection.
- Restart and reboot actions should be used carefully.
- Clip and playlist dropdowns are loaded automatically on connect. Manual refresh is only needed if content has changed since connecting.
- The **Output Status** feedback on a button shows the output name, clip name, and time remaining automatically — no manual updates required.
- System monitor feedbacks (ping, record time, NAS) update automatically every 5 seconds with no operator action needed.
- Meta marks are created with your configured username, not a generic system user.
