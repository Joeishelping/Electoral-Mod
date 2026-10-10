# ElectoralV2

A Minecraft Bedrock add-on for political roleplay servers. A **Board Table** block runs elections for as many nations as you like. You run the countries; the board runs the vote and then plays out a live **election night**, about 20 minutes of results streaming into chat with a scoreboard on everyone's screen.

Requires Minecraft Bedrock **1.21.90 or newer**. No Beta APIs needed.

## Install

1. Open `ElectoralV2.mcaddon` (build it with `python3 tools/package.py`), or put `packs/ElectoralBP` in `behavior_packs/` and `packs/ElectoralRP` in `resource_packs/` on your server.
2. Turn on both packs for the world.
3. Get the **Board Table** from the creative menu (Items tab), or craft it: paper, book, paper / three planks / stick, empty, stick.
4. Admins: operators, or `/tag <player> add electoral_admin`.

Right-click the table to open it. `/scriptevent electoral:open` also works.

## Running an election

1. **Add a nation** and pick its government type (see below).
2. **Counties.** Add counties by type: farmland, mining hills, port town, capital, and so on. The type decides who lives there. Each county also gets a historical party lean from how well each party's platform fits its people. Counties remember every result, and their lean drifts toward the parties they keep backing. Each county shows a pattern ("Safe Workers", "Leans Traders", "Swing county") and its past winners.
3. **Candidates.** You type the names, then shape them with traits, an agenda, a running mate and lobby backers (see below).
4. **Judge the term.**
   - *Leader Performance* sliders rate whoever is in office.
   - *Issues of the Term* are toggles for what happened: War, Recession, Boom, Scandal, Famine, Strikes, Crime Wave, Drug Epidemic, Censorship Row, Gun Violence Crisis, Lobbying Scandal, Migration Wave, Plague, Disaster, Popular Reform, Riots. These change what voters care about and how they judge the officeholder, and they reset once a new term starts.
5. **Open voting.** Players vote at any Board Table. Run polls during the campaign: they give win chances and rate each county Safe, Likely, Lean or Toss-up, and they can be wrong. Chat warns everyone 10, 5 and 1 minute before the polls close.
6. **Election night** starts when the polls close. You set how long it lasts (default 20 minutes).

## Election night

Every election rolls its own **election-day surprises**: storms that keep voters home, record lines, last-minute scandals, endorsements, ground games, debate momentum, ballot shortages. These change the real numbers and get reported as news during the night.

The night itself plays out differently for each government type:

| Government | Election night |
|---|---|
| **Democracy** | Exit polls, then counties report in batches. Early batches can lean differently from the final count, so leads flip. Safe counties get **called**, counties within one point go to a **recount**, and the race is **projected** once a candidate locks a majority of electors. Concession at the end. |
| **Parliament** | Constituencies declare their seats as they finish, then live **coalition talks**: talks collapse over the issues the parties disagree on most, partners join, or a minority government forms. |
| **Single-Party State** | Official bulletins arrive suspiciously fast with near-total turnout. State media spin, rumors of stuffed ballot boxes, **crowds protesting** in the most-rigged districts. Admins can see the secret true count, and if real support collapses the Party Council may step in. |
| **Royal Council** | Each county's noble house and lesser lords swear fealty one by one. Nominating ballot first, and **gold buys wavering houses** between rounds. |
| **Clan Council** | Clans raise their banners. Two-thirds must agree, clans favor their own, and **slighted clans storm out** when their candidate is eliminated. |
| **Sacred Conclave** | Secret ballots. **Dark smoke** means no decision; **bright fire** means a Prophet has been chosen. Piety and honesty matter most. After 5 failed ballots a simple majority is enough. |
| **Military Junta** | Garrisons, cavalry and artillery pledge their troops. Competence and security rule, and a strong loser may launch a **coup**, which can succeed. |
| **Guild Oligarchy** | Only the Business Lobby, merchants and the wealthy vote, weighted by their region's wealth. Exchanges report shares live and ranked-choice rounds settle it. Money talks. |

During the night:
- A **sidebar scoreboard** shows electors, seats, vote share or council share.
- The **action bar** shows live totals with the percentage counted.
- Race calls and the winner flash **on screen** with a sound.
- The Board Table's **Live Results** page shows every county's progress bar, who's leading, called counties, recounts and the latest news.

Admins can skip to the final result. If the server restarts during a count, the night picks up where it left off.

## Interest groups

Counties are made of interest groups, not just jobs:

- **Lobbies and movements:** Business Lobby, Trade Unions, Religious Conservatives, Progressives, Environmentalists, Patriots & Nationalists, Libertarians, Gun Owners
- **People and classes:** The Wealthy Elite, Middle Class, The Poor, Youth & Students, Retirees, Immigrants, Soldiers & Veterans
- **Trades:** Farmers, Miners & Factory Workers, Merchants & Traders

Each group has its own stands on the 15 hot-button issues: Taxes & Business, Welfare State, Unions & Wages, Military Spending, Crime & Policing, Religion & Values, Environment, Trade Policy, Foreign Policy, Public Spending, Central Power, Immigration, Gun Rights, Free Speech and Drug Policy. Each group also has its own priorities, turnout habits, taste in leaders, and rival groups.

County types decide the mix: Capital City, Farm Country, Industrial Town, Port City, Frontier Backcountry, Religious Heartland, Military Town, Financial District, University Town, Wealthy Suburbs, Wild Country, Working-Class Slums, Immigrant Quarter and Retirement Coast.

## The people you choose matter

Candidates are characters, in the spirit of CK3:
- **Traits** (up to 3): War Hero, Devout, Secularist, Corrupt, Squeaky Clean, Populist, Elitist, Business Mogul, Union Organizer, Outsider, Career Politician, Hardliner, Bridge Builder, Folk Hero, Immigrant Roots, Green Crusader, Demagogue, Silver Tongue, Gaffe-Prone and more. Each trait wins over some groups and alienates others. Traits also drive election-day events: corrupt candidates get caught taking bribes, silver tongues win debates, gaffe-prone candidates blunder on hot mics, and populists and demagogues fire up their base.
- **Agenda:** up to 3 causes they're lobbying for, such as "Gun Rights", "Tax the Rich" or "Close the Borders".
- **Running mate:** their traits, home county and contacts help or hurt the ticket.
- **Lobby backers:** up to 2 lobbies bankroll the campaign. Their members rally to the candidate, but rival groups resent it.
- **Ratings, courting, campaign trail:** popularity, charisma, competence, honesty, war chest; which groups they court; and which counties they campaign in.

**Group Support** shows, Democracy-game style, how every interest group feels about a candidate and why, for example "+ Union Organizer, + Higher Minimum Wage, − Gun Rights, + Running mate Cyra". The nation's **Interest Groups** page shows how each group feels about whoever is in office.

## How voters decide

Every interest group in every county scores every candidate on:
- policy stances and agenda
- traits, personal appeal and running mate
- lobby backing
- local ties
- whether the candidate courted them
- the county's historical party loyalty
- the officeholder's record (performance sliders plus issues of the term)

Votes then include random swings at the national, county and group level, plus that election's surprises. Results show why each county went the way it did, and how every group voted.

## Development

```
npm test                    # engine + election-night tests, and random clicking through every menu against mocked Minecraft APIs
python3 tools/package.py    # builds dist/ElectoralV2.mcaddon
```
