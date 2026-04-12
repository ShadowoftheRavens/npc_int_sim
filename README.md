# NPC Interaction Simulator

A browser tool for planning and testing character relationships in a game world.

## User Guide

## Purpose

This app is for people building stories, quests, RPG systems, or social simulations.

Its main purpose is to help you answer questions like:
- What happens to a character relationship after repeated positive or hostile actions?
- How does one NPC interaction affect faction reputation?
- How do faction alliances and rivalries change the wider world over time?

Instead of tracking this by hand, you can run interactions in the app and immediately see the changes.

## What It Helps You Do

Use it as a sandbox to:
- Prototype NPC behavior before writing full game logic
- Test faction balance for your world
- Explore "what if" scenarios quickly
- Share or reload test data using import/export

## How It Works (Simple Version)

You choose an action on an NPC card (like Help, Charm, or Threaten), and the app updates the world state.

When you interact with an NPC, the app updates:
- Their stats (trust, fear, respect, readiness)
- Their mood
- Their recent memory
- Their faction standing and related faction effects

## Tags As DM Notes

You can use character tags as quick mental notes for your campaign planning.

Examples:
- "owes player favor"
- "secretly loyal to temple"
- "hates city guard"

These tags help you remember story context while testing interactions.

## Character Sliders Explained

When you create or edit a character, you can set sliders that define how they behave.

### Relationship Sliders

- Trust:
Higher trust means the NPC is more likely to respond positively to you.
Lower trust means they are suspicious or unfriendly.

- Fear:
Higher fear means the NPC feels threatened, nervous, or pressured.
Lower fear means they feel safer and calmer.

- Respect:
Higher respect means the NPC sees you as capable, important, or worth listening to.
It also reflects how respected that NPC is among other people who know them.
Lower respect means they are more dismissive and carry less social weight.

- Readiness:
Higher readiness means the NPC is more tense and ready to react (often more hostile).
Lower readiness means the NPC is calmer and easier to approach.

### Personality Sliders

- Brave:
Higher brave means they are harder to intimidate.
Lower brave means they are easier to scare.

- Greed:
Higher greed means money-based actions usually affect them more.
Lower greed means coin has less influence.

- Loyalty:
Higher loyalty means they are steadier and less likely to turn quickly.
Lower loyalty means relationships can shift faster.

- Aggression:
Higher aggression means they are more confrontational and reactive.
Lower aggression means they tend to stay calmer.

Tip: Start with middle values, then change one slider at a time so you can clearly see what each slider does.

## Faction Standing Explained

Each faction has a standing value from 0 to 100.

There are two alliance levels you can set:

- NPC level: for each NPC, you can set affiliated factions and hated factions.
- Faction level: each faction can also be allied with other factions, or hostile to other factions.

This means one NPC can have personal faction ties, while their main faction also has world-level alliances and rivalries.

- Higher standing means that faction is more friendly to you.
- Lower standing means that faction is more hostile or distrustful.

The standing bar changes color based on score:

- 0 to 34: Low standing (red)
- 35 to 65: Neutral or mixed standing (gold)
- 66 to 100: High standing (green)

So the color changes at these points:
- It changes from red to gold at 35
- It changes from gold to green at 66

Tip: If one faction changes, linked factions may also shift because alliances and rivalries can cause spillover.

Example (merchant faction):

- Red merchant faction standing can mean prices are increased for you.
- Yellow merchant faction standing can mean normal, neutral prices.
- Green merchant faction standing can mean prices are reduced for you.

This faction effect can sit on top of individual character relationships, so both faction standing and personal NPC trust/respect can influence outcomes.

Important: not every action has to change global faction standing.
Some actions can be treated as personal-only outcomes that affect just that NPC relationship.

## Quick Start

This app is intended to run from GitHub Pages.

1. Open the hosted app URL.
2. Click New Character or New Faction to start.
3. Use action buttons on NPC cards to simulate interactions.
4. Import or export data from the top toolbar when needed.



## What You Can Do

- Create and edit NPCs
- Create and edit factions
- Run actions: Help, Charm, Threaten, Betray, Pay
- Search NPCs by name
- Filter NPCs by faction
- Show or hide dead NPCs
- Mark NPCs as dead (disables their interactions)
- Import and export NPC/faction data
- Switch light and dark mode
- Reset all data back to defaults

## Save, Import, and Export

- Your changes are saved automatically in your browser.
- On GitHub Pages, saves are stored per browser and per device.
- Import NPCs and factions separately using the two import buttons.
- Export creates two files:
  - One NPC export file
  - One faction export file

Tip: export regularly if you are testing many changes and want backups.

## Troubleshooting

- If import/export behavior looks limited, make sure you opened the app from the GitHub Pages URL and not directly from a downloaded file.
- Some browser-only storage features vary by browser type and version.
- If your data looks wrong after many tests, use Reset to return to the default state.
- If actions seem disabled for a character, check whether that NPC is marked as dead.

## End-of-Guide Technical Notes

This section is optional and for technical readers.

### Stack

- Vanilla HTML, CSS, JavaScript (ES modules)
- No build step required

### Persistence

- localStorage fallback is always used
- When File System Access API is available, the app can also use linked folders
- NPC files are stored under `characters`
- Faction files are stored under `factions`

### Key Files

- `index.html`: app shell
- `main.js`: bootstrap and wiring
- `ui.js`: rendering and UI behavior
- `npcEngine.js`: action resolution and reputation logic
- `characterBuilder.js`: NPC modal
- `factionBuilder.js`: faction modal
- `fileSystem.js`: file/localStorage helpers
- `storage.js`: app state save/load
- `data.js`: default dataset

