# Evertz DreamCatcher Companion Module

Companion control module for Evertz DreamCatcher replay systems.

This module provides operator-focused control of DreamCatcher outputs, replay workflows, capture control, routing, mosaic layouts, session-based clip recall, and system maintenance directly from Bitfocus Companion.

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

Recommended workflow:

1. Connect the module to DreamCatcher.
2. Press **Refresh Connection**.
3. Confirm your output, session, and source dropdowns are populated.
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

Operator name used for session control and PBS/readable ID workflows.

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

## Goto In

Moves the selected output to the current In mark.

Options:

- Output

Use when:

- Reviewing a marked clip
- Jumping back to the start point before creating or checking a clip
- Quickly lining up the output at the In mark

---

## Goto Live

Returns the selected output to live capture.

Options:

- Output

Use when:

- Leaving replay mode
- Returning to the live source
- Resetting an output after playback or scrubbing

---

## Goto Out

Moves the selected output to the current Out mark.

Options:

- Output

Use when:

- Reviewing the end of a marked clip
- Checking the Out point before creating a clip
- Verifying clip duration or endpoint

---

## Mark In

Sets the In point on the selected output.

Options:

- Output

Use when:

- Starting a clip mark
- Defining the beginning of a replay or highlight

---

## Mark Out

Sets the Out point on the selected output.

Options:

- Output

Use when:

- Finishing a clip mark
- Defining the end of a replay or highlight

---

## Pause

Pauses playback on the selected output.

Options:

- Output

Use when:

- Freezing replay playback
- Holding on a frame
- Stopping transport without returning live

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

Use when:

- Playing replay
- Running slow motion
- Playing forward or reverse
- Resuming from pause

---

## Play Clip by Page / Bank / Slot / Angle

Finds a clip using Page / Bank / Slot / Angle and immediately plays it.

Options:

- Output
- Page
- Bank
- Slot
- Angle

Use when:

- You want a one-button recall and roll
- You know the PBS location of the clip
- You do not need to cue and wait

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

Use when:

- You know the PBS location of a clip within a session
- You want fast session-based replay recall
- You do not want to browse a clip dropdown

Recommended workflow:

1. Press **Refresh Connection** or **Refresh Sessions**.
2. Select the correct session.
3. Enter the Page / Bank / Slot / Angle.
4. Trigger **Play Session Clip by PBS**.

---

## Raw JSON-RPC

Advanced manual command tool for testing or troubleshooting.

Use when:

- Testing a new command
- Troubleshooting server communication
- Verifying behavior before adding a dedicated action

Recommended for advanced users only.

---

## Reboot Server

Reboots the DreamCatcher server.

Use when:

- A full server reboot is required
- Directed by engineering or support
- Normal service restart actions are not enough

This is a high-impact action. Use carefully.

---

## Recall Last Clip

Cues the most recently created clip to the selected output.

Options:

- Output
- Cue Speed

Use when:

- You just created a clip and want to replay it quickly
- You want a fast highlight workflow
- You do not want to manually search for the newly created clip

---

## Refresh Bins

Refreshes available bins for Companion dropdowns.

Use when:

- Bins have changed
- A bin dropdown is empty or outdated
- You need Companion to reload bin information

---

## Refresh Export Profiles

Refreshes available export profiles for Companion dropdowns.

Use when:

- Export profiles have changed
- Export profile dropdowns are stale
- You need Companion to reload export settings

---

## Refresh Inputs

Refreshes available input sources for Companion dropdowns.

Use when:

- Inputs have changed
- Input dropdowns are empty
- Routing actions do not show the expected sources

---

## Refresh Outputs

Refreshes available DreamCatcher outputs for Companion dropdowns.

Use when:

- Outputs have changed
- Output dropdowns are empty
- Companion is not showing the expected output names

---

## Refresh Session Clips

Refreshes clip names for the selected session.

Options:

- Session

Use when:

- You want Companion to reload clip names for a session
- You are using session-based workflows
- Clips were created after the last refresh

Note: Session PBS workflows do not require browsing the clip dropdown, but this action is still useful for loading clip metadata and keeping session data current.

---

## Refresh Sessions

Refreshes the list of available sessions.

Use when:

- A new session was created
- You switched sessions
- The session dropdown is empty or outdated

---

## Restart System Components

Restarts selected DreamCatcher system components.

Options:

- Restart Inputs
- Restart Outputs
- Restart AMP Connections
- Restart VUE
- Confirm Restart

Use when:

- Recovering from component-level issues
- Restarting specific services without rebooting the full server
- Troubleshooting control or output behavior

The confirmation checkbox is included to reduce accidental restarts.

---

## Route Input to Output

Routes a selected input source to a selected output.

Options:

- Input
- Output

Use when:

- Monitoring a live source
- Sending an input directly to an output
- Quickly changing what an output is showing

---

## Scrub

Moves playback forward or backward by a specific number of frames.

Options:

- Output
- Frames

Examples:

```text
30 = forward 30 frames
-30 = backward 30 frames
```

Use when:

- Frame-accurate review
- Checking replay timing
- Fine-tuning clip marks

---

## Set Custom Mosaic Layout

Creates a custom multi-box mosaic layout on the selected output.

Options include:

- Output
- Number of boxes
- Border thickness
- Border color
- Input/source for each box
- Crop region for each box
- Screen placement for each box

Supported layouts:

- 2 box
- 3 box
- 4 box

Use when:

- Building a confidence monitor layout
- Viewing multiple inputs on one output
- Creating a custom operator monitoring view

---

## Set Output Idle / Black

Sets the selected output to idle/black.

Options:

- Output

Use when:

- Taking an output dark
- Clearing content from an output
- Resetting an output to a safe state

---

## Start Capture

Starts capture/recording.

Use when:

- Beginning event ingest
- Starting replay recording
- Preparing for live operation

---

## Stop Capture

Stops capture/recording.

Use when:

- Ending event ingest
- Stopping replay recording
- Wrapping up an event

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

## System Restart

Restart and reboot controls.

Includes:

- Restart All Components
- Restart Inputs
- Restart Outputs
- Restart AMP
- Restart VUE
- Reboot Server

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

## Clip Workflow

Clip marking and creation tools.

Includes:

- Mark In
- Mark Out
- Create Clip
- Recall Last Clip

## Clip Hotkeys

PBS/readable ID based clip recall tools.

Includes:

- Cue Clip by PBS
- Play Clip by PBS
- Cue Session Clip by PBS
- Play Session Clip by PBS

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

# Recommended Operator Workflow

## Before an event

1. Confirm the DreamCatcher IP, port, and username are correct.
2. Press **Refresh Connection**.
3. Confirm outputs, inputs, sessions, and dropdowns populate correctly.
4. Start capture if needed.

## During replay operation

Use:

- **Mark In**
- **Mark Out**
- **Create Clip**
- **Recall Last Clip**
- **Cue Session Clip by PBS**
- **Play Session Clip by PBS**
- **Goto In**
- **Goto Out**
- **Goto Live**

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

---

# Notes

- Refresh Connection is the safest first troubleshooting step for stale dropdowns.
- Output actions require the correct output selection.
- Restart and reboot actions should be used carefully.
