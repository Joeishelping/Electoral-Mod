# Electoral Board Table

A Minecraft Bedrock add-on for political roleplay servers. Players use a **Board Table** block to set up nations, governments and diplomacy, and to run AI-simulated elections and successions. Regions vote according to who lives there, what those voters care about, what the candidates stand for and how well the government has performed.

Requires Minecraft Bedrock **1.21.90 or newer**. It uses only stable script APIs (`@minecraft/server` 2.0.0, `@minecraft/server-ui` 2.0.0), so you don't need to turn on Beta APIs.

## Install

1. Run `python3 tools/package.py` to build `dist/ElectoralBoardTable.mcaddon`, or zip `packs/ElectoralBP` and `packs/ElectoralRP` yourself.
2. Open the `.mcaddon`, or copy the two folders into `behavior_packs/` and `resource_packs/` on your server.
3. Enable both packs on the world.
4. Get the **Board Table** from the creative menu (Items tab), or craft it:

   ```
   paper  book   paper
   planks planks planks
   stick         stick
   ```

5. Right-click the table. If the block isn't handy, `/scriptevent electoral:open` opens the same menu (from a command block, add a player name as the message).

**Admins** are operators, plus anyone given the tag: `/tag <player> add electoral_admin`.
**Leaders**: link a notable to a player's gamertag. While that notable holds office, the player gets a **Leader's Desk** for appointments, naming an heir and foreign policy.

## Quick start

1. **Found a Nation**: pick a government type and a number of regions. The board generates regions, parties, notables, houses or a dynasty where needed, and a sitting government.
2. **Manage Nation → Performance Sliders**: rate how the leader has done (economy, jobs, security, stability, infrastructure, diplomacy, public services, food, integrity).
3. **Elections & Succession → Call New Election**: choose the candidates and the counting method.
4. Players cast ballots at any Board Table. Each player ballot counts as a configurable number of votes in the player's home region.
5. **Polls & Forecast** runs 120 simulated elections and reports win chances and region ratings (Safe, Likely, Lean, Toss-up).
6. **Count the Votes**: the result is announced in chat. The results viewer breaks it down by region, by voter group (exit poll) and by counting round, then shows the new cabinet and line of succession.

You can edit everything the generator made: regions, voter mix, local issues, party platforms, candidate stances, campaigns, families, houses and rules.

## Government types

| Type | Who chooses | How it's counted | Cabinet | Succession |
|---|---|---|---|---|
| **Democracy** | All residents | Regional electors (or popular vote, runoff, ranked choice) | Merit | Deputy, then cabinet order |
| **Parliamentary Assembly** | All residents | Proportional seats per region, then coalition bargaining | Portfolios split by seat share | Party caucus picks |
| **Single-Party State** | All residents (turnout enforced), vetted candidates only | Managed count favouring the endorsed candidate; the true count stays internal | Loyalty | Designated successor |
| **Hereditary Monarchy** | Bloodline; the great houses confirm the heir | Council consensus (can pass over a weak heir) | Family | Primogeniture, seniority, named heir or elective |
| **Clan Confederacy** | Clan heads choose among bloodline members | Consensus at ⅔ | Family | Elective within the bloodline |
| **Sacred Conclave** | Clergy electors from each region | Rounds of balloting until ⅔ agree | Loyalty | Council |
| **Military Junta** | Garrison officers | Council majority, with competence weighted heavily | Loyalty | Council |
| **Guild Oligarchy** | Stakeholders, weighted by their region's wealth | Ranked choice; money matters more | Patronage | Deputy |
| **Technocracy** | Educated stakeholders | Ranked choice; competence dominates | Merit | Deputy |
| **Commune** | All residents | Ranked choice | Merit | Deputy |

Each nation can override any rule under **Government Type & Rules**: counting method, election integrity, enforced turnout, leader protection, consensus threshold, succession law, heir confirmation, cabinet style, term limit, proportional threshold, running mates, votes per player ballot and auto-appointments.

## How the election engine works

The engine works like the models political scientists use to explain real elections.

**Voters.** Every region is a mix of 13 voter groups: farmers, miners, merchants, laborers, soldiers, clergy, scholars, nobles, youth, elders, sailors, artisans and frontier settlers. Each group has:
- a stance on 12 issues
- how much it cares about each issue
- a base turnout
- partisan loyalty and volatility
- what it values in a person (charisma, competence, integrity, wealth)
- rival groups it resents

Regions add their own population, wealth, urbanisation, local issue emphasis, party leanings, favour or neglect from the government, and unrest.

**Candidates.** Each candidate has stances on the 12 issues, up to 3 focus issues, up to 3 voter groups they court, up to 4 campaign-stop regions, a home region, a party, a running mate, and ratings for popularity, charisma, competence, integrity, loyalty and funds. Hereditary systems also track bloodline, parent, legitimacy and clan.

**Scoring.** Every voter group in every region scores every candidate on eight things:
- **Policy distance**, weighted by how much the group cares about each issue
- **Issue ownership**: campaigning on an issue the group cares about and agrees with helps; pushing the opposite stance hurts
- **Personal appeal**, weighted by what that group values
- **Local ties**: home region and campaign stops
- **Courting**: helps with the targeted group and slightly annoys its rivals
- **Record**: the performance sliders, filtered through the metrics each group cares about. The incumbent gets full credit or blame, their party gets part of it, and long-serving leaders see voter fatigue
- **Party loyalty and learned habits**
- **Kinship and legitimacy** (councils and hereditary systems)

**Voting.** Groups vote probabilistically (multinomial logit). Correlated national, regional and group-level shocks act like polling error, so upsets happen, but not at random. Turnout rises when a group cares about the race or is being courted, and falls when every option is bad.

**Context.**
- Wars make security matter more and rally voters around the incumbent.
- Trade pacts make trade policy matter more.
- Issues the candidates campaign on become more important to everyone (agenda setting).

**Counting.** The nation's method then counts the votes: regional electors with a contingency runoff, popular vote, two-round runoff, ranked choice (eliminated candidates' votes move to their supporters' next choices), D'Hondt proportional seats with the minimal winning coalition chosen by ideological closeness, or council rounds.

**Managed counts.** In low-integrity systems:
- The published figures are inflated for the endorsed candidate.
- Admins can still view the true numbers.
- If true support collapses, there's a chance the leadership forces a handover anyway. How likely that is depends on leader protection.
- The gap between published and true results adds to regional unrest.

**Explanations.** Each result names the decisive factor nationally and in each region, such as "stance on Trade" or "the government's record". It also lists the strongest and weakest groups, the closest race, turnout extremes and regions that flipped since the last election.

**Learning.** After each election:
- Voter groups grow loyal to the parties they backed.
- Failing policy areas become more important to voters, and the winner's agenda sticks.
- Winners gain popularity and losers lose some.

**Cabinets.** Offices are filled by scoring every eligible notable for every office under the government's cabinet style. Pinned appointments are kept. Coalition governments split portfolios in proportion to seats.

**Successions.** Death, abdication, resignation and removal follow the government's rule. Hereditary lines use real primogeniture order (the eldest child's whole line before younger children), with regency for minors and houses that can contest a weak claim.

Each election stores its random seed, so you can reproduce the same count from it.

## Layout

```
packs/ElectoralBP/            behavior pack
  blocks/board_table.json     the block (custom component electoral:board_table)
  recipes/board_table.json
  scripts/main.js             entry: block interaction + /scriptevent
  scripts/core/               state model, seeded RNG, dynamic-property storage
  scripts/data/               issues, voter groups, region templates, metrics, governments, names
  scripts/engine/             voter model, counting, councils, succession, cabinets, learning, forecasts, generator
  scripts/ui/                 menus
packs/ElectoralRP/            model, textures and names
tests/                        Node tests (engine checks and a UI fuzzer with mocked Minecraft APIs)
tools/package.py              builds the .mcaddon
```

To add a voter group, issue, office or government type, add an entry in `scripts/data/`. The engine and menus pick it up automatically.

## Development

```
npm test               # engine tests + random-walk fuzzing of every menu against mocked APIs
python3 tools/package.py
```

The world state is stored as JSON in world dynamic properties. It's split into chunks and written to two alternating slots, so a crash during a save can't corrupt the last good copy.
