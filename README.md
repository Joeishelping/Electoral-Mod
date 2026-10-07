# Electoral Board Table

A Minecraft Bedrock add-on for political roleplay servers: a **Board Table** block that runs elections for as many nations as you like. You run the countries; the board handles the voting. It works out how each county votes from who lives there, what they care about, what the candidates stand for and how the current leader has performed. Then it counts the results live in chat, county by county.

Requires Minecraft Bedrock **1.21.90 or newer**. No Beta APIs needed.

## Install

1. Open `ElectoralBoardTable.mcaddon` (build it with `python3 tools/package.py`), or put `packs/ElectoralBP` in `behavior_packs/` and `packs/ElectoralRP` in `resource_packs/` on your server.
2. Turn on both packs for the world.
3. Get the **Board Table** from the creative menu (Items tab), or craft it: paper, book, paper / three planks / stick, empty, stick.
4. Give admins the tag: `/tag <player> add electoral_admin` (operators already count).

Right-click the table to open it. `/scriptevent electoral:open` also works.

## Using it

1. **Add a Nation.** Type its name and pick a voting style. Add as many nations as you want.
2. **Counties.** Add counties and pick what kind of place each one is (farmland, mining hills, port town, capital...). That decides who lives there and what they care about.
3. **Candidates.** Names start empty, so you type them yourself. Give each candidate up to 3 main issues, ratings (popularity, charisma, competence, honesty, money), groups they court and counties they campaign in. Parties are optional.
4. **Leader Performance.** Rate whoever is in office. If they or their party run again, voters judge them on it.
5. **Run an Election.** Pick the candidates and how long voting stays open (or leave it open until you close it). Players vote at any Board Table, and you can run polls during the campaign. Chat warns everyone 10, 5 and 1 minute before the polls close.
6. **Count.** When the polls close, results come in one county at a time (every 8 seconds by default). Chat shows each county's result, a running total, and a projection once the race is clear. Then the winner is shown on screen. Admins can skip straight to the result.

Afterwards anyone can open the results by county, see how each voter group voted, and read why the winner won (for example "stance on Trade" or "the leader's record"). The winner is marked as in office for the next election's performance voting. Everything else that happens is up to you.

## Voting styles

| Style | How it votes |
|---|---|
| Democracy | Everyone votes; counties award electors (or popular vote, runoff, ranked choice) |
| Parliament | Seats split by party vote; a majority coalition picks the Premier |
| Single-Party State | Forced turnout and a count tilted toward the endorsed candidate. Admins can see the true count, and the leader is hard to remove |
| Royal Council | Nobles and elders vote in rounds until 60% agree |
| Clan Council | Each county's clan votes as a group until two-thirds agree; clans favor their own |
| Sacred Conclave | Clergy electors vote in rounds until two-thirds agree |
| Military Junta | Officers vote; competence matters most |
| Guild Oligarchy | Only merchants, artisans and landholders vote, weighted by wealth |
| Technocracy | Educated voters rank the candidates |
| Commune | Everyone ranks the candidates |

**Nation Settings → Voting Rules** lets you change the counting method, how honest the count is, forced turnout, leader protection, council agreement needed, how many votes a player ballot is worth, and how many seconds pass between county results.

## How the votes are worked out

Each county is a mix of voter groups: farmers, miners, merchants, laborers, soldiers, clergy, scholars, nobles, youth, elders, sailors, artisans and settlers. Each group has its own views and priorities, its own turnout habits, and things it likes in a leader.

Every group scores every candidate on:
- their stances and main issues
- their personality
- their home county and campaign stops
- whether they courted that group
- party loyalty
- the leader's record

Votes are then cast with realistic swings, so polls can be wrong and upsets happen. Wars set through **Diplomacy** make voters care more about defense and rally them behind whoever is in office.

Voters also remember past elections: groups stick with parties they backed, and issues where the leader did badly matter more next time.

## Development

```
npm test                    # engine tests + random clicking through every menu against mocked Minecraft APIs
python3 tools/package.py    # builds dist/ElectoralBoardTable.mcaddon
```
