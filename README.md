# ElectoralV2

A Minecraft Bedrock add-on for political roleplay servers. A **Board Table** block runs elections for as many nations as you like. You run the countries; the board runs the vote and then plays out a live **election night**, about 20 minutes of results streaming into chat with a scoreboard on everyone's screen.

Requires Minecraft Bedrock **1.21.90 or newer** (tested to load on the 1.26.52 dedicated server). No Beta APIs needed.

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

## Campaign and debates

While an election is open, a country's page (and Run an Election) has **Campaign & Debates**. Everything here moves the real vote; run a poll to see it.

- **Debates:** pick who takes part, up to three topics (any issue, plus Character & Honesty or The Record in Office), and how it goes:
  - **Play it out:** each round, choose every candidate's move. If a candidate is "Played by" a player who's online (set it in the candidate's basics), that player picks their own move on their own screen; anyone who doesn't answer within a minute gets the AI's choice.
  - **Let the AI debate:** candidates choose for themselves, based on their traits, the polls and their opponents' weak spots.
  - **Submit results:** for debates acted out live on the server or in voice chat. Rate each candidate's performance 0 to 10 and pick a winner.
- **Moves:** make the case, attack their position, attack their character, hammer their record in office, pivot to a better issue, stay above the fray, go for the knockout line, or rebut.
  - **Character attacks** land hard if there's dirt (Corrupt, Free Spirit, Gaffe-Prone, Wealthy Heir, low honesty) and backfire if there isn't.
  - **Record attacks** only work on whoever holds office, and use their actual crisis grades.
  - **Knockout lines** are a big win or an awkward silence.
  - **How a move lands** depends on charisma, competence and traits (Silver Tongue shines, Gaffe-Prone can stumble mid-sentence) plus luck.
- **What a debate changes:** a debate swings support overall and with specific interest groups. It makes its topics matter more to voters on election day, and changes the candidates' popularity and honesty. It plays out in chat line by line, ending in a snap poll of who won. Transcripts can be re-read, and the newspaper reports the result. Once real debates have been held, the random "final debate" election-day event no longer happens.
- **Campaign trail:** each candidate gets 4 actions per election:
  - **Rally:** boosts support in one county.
  - **Positive ad or attack ad:** on an issue.
  - **Court an interest group:** wins it over, but its rivals notice.
  - **Fundraiser:** refills the war chest.

  Rallies, ads and courting cost money from the candidate's war chest.

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
- An **election-night theme** plays on loop for everyone, including players who join partway, and fades out when the winner is declared. Admins can turn it off under Board Data. The audio file isn't in this repository: put an `.ogg` at `packs/ElectoralRP/sounds/electoral/night_theme.ogg` before building.
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

## Economy

Each country runs on economy turns (every 20 minutes by default; admins can run one immediately). Its counties produce GDP, which depends on:
- what each county is (a Financial District out-produces Farm Country)
- infrastructure and research levels
- taxes, trade partners and tariffs
- wars, unrest, debt and active situations

The Economy screen has:
- **Taxes & Tariffs:** income tax, business tax, tariffs, and a spending level (above 100% runs a deficit; debt accrues interest and drags GDP).
- **Budget Allocation:** Military & Defense, Infrastructure, Welfare & Health, Research, Civic Propaganda. Each one builds up over time:
  - Military wins wars and disputes.
  - Infrastructure grows GDP and speeds crisis response.
  - Welfare improves services and calms unrest.
  - Research gives long-term growth.
  - Propaganda buys calm at the cost of honesty.

The economy drives the Leader Performance sliders automatically (you can switch that off). Interest groups react to fiscal choices: the Business Lobby hates business tax, unions and farmers like tariffs, veterans love a big military budget, and so on.

High tariffs strain trade partners. A country deep in debt can no longer fund crisis responses properly.

## Situations

Situations strike a country's cities during economy turns, or an admin can trigger one. There are 201 of them across 31 categories:

- **People and politics:** campaigns (scandals about your actual candidates, rivals surging, defections, gaffes, donors), lobbies (ultimatums, union drives, clergy, greens, farmers, veterans, students, pensioners), counties (town feuds, autonomy demands, defiant mayors, boomtowns, ghost towns), scandal and media.
- **Land and people:** disasters and nature (volcanoes, blizzards, tsunamis, locusts, heatwaves, meteors), health (cholera, flu, mystery illnesses, addiction, cures), unrest, crime, religion, culture, society and labour.
- **Economy and the world:** economy, trade, energy, infrastructure, science, the military, espionage, diplomacy and war.
- **Government-specific:** court intrigue and successions for monarchies, blood feuds for clans, party purges for single-party states, coup plots for juntas, guild mergers for guild oligarchies, heresy trials for theocracies, filibusters and referendums for democracies and parliaments.

They only use names you entered: your counties, your candidates and ruler, the other country, and its real cities. For example: "Thousands of refugees fleeing Gorgonzola's Kesh are arriving in Northvale." Scenarios about a person need that person to exist, and their choices change that candidate's popularity, honesty, charisma, competence or war chest.

- **Responses:** each situation has its own three responses, plus **Do nothing**, and a **priority (0–5)** that costs money every turn. Neglected crises grow, escalate (an Outbreak becomes a Plague) and can spread to other cities. Opportunities expire if ignored.
- **Counter-situations:** other countries react with their own moves. When Baza finds the deposit, Gorgonzola can invest in a joint venture, seize the deposit, or undercut Baza's exports.
  - Helping speeds Baza's recovery and improves relations.
  - Exploiting costs Baza money.
  - Escalating opens a **dispute**.
- **Disputes and rulings:** you rule on who wins, or roll the dice using both countries' military strength. Battles, referendums and arbitration also wait for your ruling. The winner can take the city. Rewards from a contested situation are held until the ruling.
- **Grades:** every outcome gets a grade from A to F and goes on the country's **Crisis Record**, along with what every country did.
- **Elections:** challengers tear into a badly handled crisis in debates, and incumbents tout the good ones. Affected counties swing for or against the incumbent. Interest groups remember which side the government took, and rally behind it or against it.

- **Consequences:** choices come back to bite (or reward) you a turn or two later, CK3-style. Leak a rival's scandal and they may sue for libel. Send police into a strike and you may get a martyr. Ignore a coup plot and the tanks roll. Hand rebuilding contracts to friends and the cover-up may be exposed. Chat says "Because of..." so everyone knows why. 28 situations only ever happen this way.
- **Your ruler's character:** traits draw their own trouble. A Corrupt ruler gets far more scandals, a Devout one more prophets and clergy, a War Hero more mutinies and veterans, while a Squeaky Clean one rarely gets scandals at all. Some traits unlock a fourth choice nobody else gets: a War Hero can lead the defence from the walls, a Silver Tongue can laugh off a gaffe, a Union Organizer can join the picket line.
- **Pop-ups:** when something hits a country, its online rulers get a pop-up to decide right away (Decide Now / Later / Stop these pop-ups). Countries without listed rulers ping the admins. Toggle it on the Board Table's main page.
- **Pace:** Economy → Settings → "How often situations strike": Off, Calm, Normal, Busy or Chaotic, per country.

## Newspapers

Every country has its own paper (rename it from the country's page). Every 3 economy turns it prints in chat:
- a headline about the biggest thing that happened, and how each situation was handled, with grades;
- a poll of the leader's approval (and how it moved), and the rising star among the other candidates;
- the economy's growth, the treasury and any wars;
- gossip about the candidates, based on their traits.

The latest edition can be re-read from the country's page.

## Treaties

Rulers propose, and the other country's ruler accepts or refuses (they get a pop-up). Diplomacy → a country → **Propose a Treaty**:
- alliance, trade pact, friendship, normalising relations, or peace (during a war);
- giving them one of your counties, or asking for one of theirs;
- paying them, or demanding tribute.

Making things worse (tense, rivalry, war) needs no one's permission; making things better needs both sides. Offers lapse after 48 hours. Admins can still set any relation directly.

## Development

```
npm test                    # engine + election-night tests, and random clicking through every menu against mocked Minecraft APIs
python3 tools/package.py    # builds dist/ElectoralV2.mcaddon
```
