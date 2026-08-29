# Research

Owner: **Davin**.

Scaffold stub — headings are the questions worth answering, not answers.

## The claim we're making

Hard-won failure knowledge is locked inside elite networks. A YC insider hears
"three teams died doing that, here's why" over coffee. A first-gen, regional or
outsider founder has no such rolodex. Graveyard hands that buried knowledge to
the founders without one.

**TODO:** find 2–3 citable data points supporting this. It's the spine of the
pitch and it currently rests on assertion alone. A judge who doesn't already
believe it will discount the whole Idea score.

## Prior art — and why it didn't work

| Thing | What it is | Why it isn't us |
|---|---|---|
| Autopsy.io / GetAutopsy | Founder-written post-mortems | |
| Failory Graveyard | ~100 curated failures | |
| CB Insights post-mortems | The canonical list | |

**TODO(Davin):** fill the third column honestly. "They're static spreadsheets
that stopped updating" is the current answer — verify it's true, and find out
*why* they stopped. If the answer is "nobody wanted this", we need to know that
now, not on stage.

## The failure taxonomy

CB Insights' top reasons for startup failure — the intended `rootCause`
vocabulary: no market need · ran out of cash · wrong team · out-competed ·
pricing/cost · poor product · no business model · bad timing · regulatory.

**TODO:** decide whether `rootCause` is free text or a controlled vocabulary
from this list. Free text reads better; a controlled list makes patterns
groupable across matches. Worth 10 minutes of team discussion — it affects the
enrichment prompt and possibly the UI.

## The ~50 seed startups

**TODO(Davin):** shortlist. Bias toward (a) good Wayback snapshots — that's the
demo's wow moment, and (b) ideas a judge might plausibly type.

### HERO shortlist — 9 deepest-paper-trail entries

Pulled from `data/startups.enriched.json` (source of truth, 173 records). These
9 have the fullest narrative fields and a live `waybackUrl`, and each maps to an
idea a judge could plausibly type. Fields below are copied from the JSON, not
re-researched — verify against `sources[]` before relying on any of it.

Data-quality note: the `timingNote` on **Pets.com**, **Vine** and **Friendster**
contains a mojibake artifact (`â€”` where an em dash should be). Fix in the JSON
during QA.

---

**1. Path** — private social network · Information · 2010–2018 · raised $59M
- Judge types: "a private social network just for close friends"
- Proximate: announced shutdown Sept 2018; the 2015 Kakao acquisition never revived it.
- Root cause: raised $50M+ (turned down a reported $100M Google offer in 2011), then a run of self-inflicted privacy scandals broke user trust — caught uploading users' phone contacts without permission (2012), $800K FTC fine for collecting data from under-13s (2013), cut off from Facebook's Find Friends over SMS spam. Reputational damage plus Instagram and Snapchat competing for the same close-friends use case.
- Timing: not a timing problem — self-inflicted, during a period when trust was cheap to lose and hard to win back.
- Lesson: Privacy's tightrope
- Sources: en.wikipedia.org/wiki/Path_(social_network) · techcrunch.com/2018/09/17/rip-path/ · engadget.com/2018-09-17-path-private-social-network-stickers-dead.html · venturebeat.com/ai/social-networking-app-path-will-close-down-october-18
- Wayback: https://web.archive.org/web/20200830133103if_/http://path.com/

**2. Airware** — commercial-drone hardware/software platform · Manufacturing · 2011–2018 · raised $70M
- Judge types: "an operating system / software platform for commercial drones"
- Proximate: ceased operations Sept 14, 2018 after burning $100M+ without reaching profitability.
- Root cause: bet enterprises in construction, mining and agriculture would need a common software layer ("Windows for drones"). DJI dominated hardware with cheap capable drones; enterprise adoption of drone software was slower and more fragmented than backers (a16z, Kleiner Perkins, Intel) assumed. Couldn't find a profitable niche fast enough to justify the burn. IP sold to Delair.
- Timing: a timing problem — raised big on the assumption industrial drone software would scale quickly; adoption lagged years behind the funding cycle.
- Lesson: Drones need simplicity
- Sources: en.wikipedia.org/wiki/Airware · techcrunch.com/2018/10/29/fresh-drones-of-delair/ · dronelife.com/2018/09/15/drone-company-airware-crashes/
- Wayback: https://web.archive.org/web/20190115041132if_/https://www.airware.com/

**3. Babylon Health** — AI-powered telemedicine · Health Care · 2013–2023 · raised $635M
- Judge types: "an AI chatbot that does medical diagnosis and triage"
- Proximate: US operations filed Chapter 7 liquidation Aug 15, 2023; UK business entered administration a month later. Assets sold for a fraction of the prior ~$2B valuation.
- Root cause: went public via SPAC Oct 2021, then expanded aggressively into the US and Rwanda while its NHS-dependent UK business had unsustainable economics and years of controversy over unsubstantiated claims about its AI diagnostic tool's accuracy. Overexpansion + data-breach and regulatory disputes + mounting losses left it unable to raise more capital. Founder Ali Parsa later called the SPAC listing an "unmitigated disaster."
- Timing: partly timing — rode the pandemic telehealth boom to a listing just as investor enthusiasm for unprofitable healthtech SPACs crested, then had no cushion when funding reversed in 2022–2023.
- Lesson: Quality must match scale
- Sources: en.wikipedia.org/wiki/Babylon_Health · healthcaredive.com/news/Babylon-Chapter-7-bankruptcy/691218/ · techcrunch.com/2023/08/31/the-fall-of-babylon-failed-tele-health-startup-once-valued-at-nearly-2b-goes-bankrupt-and-sold-for-parts/
- Wayback: https://web.archive.org/web/20231109022213if_/https://www.babylonhealth.com/

**4. Pebble** — smartwatches · Manufacturing · 2012–2016 · raised $40M
- Judge types: "an indie smartwatch with week-long battery life"
- Proximate: shut down Dec 2016; software and engineering team sold to Fitbit for $40M, all hardware production discontinued.
- Root cause: created the modern smartwatch category with a record-breaking 2012 Kickstarter, years before Apple or Google. Once Apple Watch launched in 2015 with iOS integration, App Store and Apple's marketing reach, Pebble's simpler battery-friendly watches lost their edge, and it couldn't raise the capital to keep competing on hardware. Fitbit took the software and patents but explicitly declined the hardware business.
- Timing: timing and ecosystem — won early with a novel category, but couldn't keep pace once platform giants entered with vertically integrated hardware-software-store ecosystems.
- Lesson: Smartwatches need ecosystems
- Sources: digitaltrends.com/wearables/fitbit-pebble-acquisition-news/ · techcrunch.com/2016/12/07/pebble-confirms-its-shutting-down-devs-and-software-going-to-fitbit
- Wayback: https://web.archive.org/web/20161229205636if_/https://www.pebble.com/

**5. EyeEm** — photo-sharing and stock-photo platform · Information · 2011–2026 · raised $24M
- Judge types: "a stock photo marketplace powered by a photographer community"
- Proximate: shut down permanently Jan 13, 2026 after filing bankruptcy in 2023 and cycling through two acquirers in three years.
- Root cause: built a large photographer community and stock marketplace but never found monetization that could compete with Getty Images or survive free-stock disruption from Unsplash. Acquired by Talenthouse for ~$40M (2021), filed bankruptcy April 2023, bought by Freepik that October. Even under new ownership — and after a backlash-inducing 2024 policy forcing photographers to grant AI-training rights — it couldn't rebuild a sustainable business.
- Timing: partly timing — the stock-photography niche was squeezed from both ends by free platforms and, later, AI image generation eating into licensing.
- Lesson: Scale beats niche
- Sources: en.wikipedia.org/wiki/EyeEm · petapixel.com/2025/12/11/eyeem-is-shutting-down/ · diyphotography.net/eyeem-closure-2026-migrate-freepik/
- Wayback: https://web.archive.org/web/20260117232909if_/https://www.eyeem.com/

**6. Theranos** — blood testing tech · Health Care · 2003–2018 · raised $1.4B
- Judge types: "cheap full blood-panel diagnostics from a single finger-prick"
- Proximate: formally ceased operations Sept 2018 after the core technology was exposed as fraudulent and its $9B valuation evaporated.
- Root cause: claimed its Edison devices could run comprehensive panels from a finger-prick, but the technology never worked reliably — most tests were secretly run on modified third-party machines and presented as Theranos's own breakthrough. WSJ reporting (John Carreyrou, from 2015) exposed the deception, triggering SEC, FDA and CMS investigations that found the lab posed "immediate jeopardy to patient health and safety." Two years of test results voided in 2016; Holmes and Balwani later convicted of wire fraud and conspiracy.
- Timing: not a timing problem — straightforward fraud; the technology never worked regardless of market conditions.
- Lesson: Transparency is key
- Sources: en.wikipedia.org/wiki/Theranos · npr.org/644844174 · sec.gov/news/press-release/2018-41 · nbcnews.com/news/crime-courts/theranos-ceo-elizabeth-holmes-indicted-wire-fraud-charges-step-down-n883791
- Wayback: https://web.archive.org/web/20181224082234if_/https://www.theranos.com/

**7. Pets.com** — online pet supply retailer · 1998–2000 · raised $300M
- Judge types: "an online store for pet food and supplies with fast shipping"
- Proximate: announced Nov 7, 2000 it would stop taking orders and liquidate — 268 days from IPO to shutdown.
- Root cause: sold heavy, low-margin supplies like litter and food below cost while absorbing shipping itself, then spent aggressively on brand marketing (Super Bowl ad, Macy's Parade balloon) to build awareness faster than unit economics could support. When the dot-com funding market collapsed in 2000 there was no capital left to subsidize orders and no profitable business underneath the marketing.
- Timing: a genuine timing problem — the infrastructure it needed (cheap fulfillment logistics, broadband and e-commerce adoption) arrived ~a decade later and let Chewy succeed on nearly the same premise.
- Lesson: Margins beat hype
- Sources: en.wikipedia.org/wiki/Pets.com · sunsethq.com/blog/why-did-petscom-fail
- Wayback: https://web.archive.org/web/20001204194300if_/http://petscom.com:80/

**8. Friendster** — early social network · Information · 2002–2015 · raised $48.5M
- Judge types: "a social network to connect with your friends"
- Proximate: the remaining social-gaming service went dark June 14, 2015, ending the site for good after years of decline.
- Root cause: pioneered mainstream social networking in 2002 but was crippled by chronic slow-loading pages and scaling failures just as MySpace and then Facebook offered faster, more reliable experiences. After losing its Western user base it pivoted to a Southeast Asia social-gaming platform in 2011, wiping all prior user data; the pivot never regained meaningful engagement and the company quietly shut down in 2015.
- Timing: a genuine timing failure — had first-mover advantage but its infrastructure couldn't keep pace with its own growth, letting Facebook out-execute it during the critical early-adoption window.
- Lesson: Speed and UX trump
- Sources: en.wikipedia.org/wiki/Friendster · failory.com/cemetery/friendster
- Wayback: https://web.archive.org/web/20160101005428if_/http://www.friendster.com/

**9. Vine** — short-video app · Information · 2012–2017 · raised $645M (acquired by Twitter pre-launch)
- Judge types: "an app for super-short looping videos"
- Proximate: Twitter announced the shutdown Oct 2016 and folded the app down completely by Jan 2017.
- Root cause: Twitter acquired Vine before launch in 2012 but never invested enough in creator monetization or platform development to keep pace once Instagram added video (2013) and Snapchat drew away users and creators. Facing its own financial pressure and an unsuccessful sale of the whole company, Twitter cut Vine in a broader round of layoffs rather than keep funding a product it had let stagnate.
- Timing: a real timing failure — had first-mover advantage in short-form video, but years of underinvestment let Instagram and Snapchat overtake it before Twitter acted. The category's scale was later proven by TikTok.
- Lesson: Neglect kills hits
- Sources: techcrunch.com/2016/10/27/twitter-is-shutting-down-vine/ · money.cnn.com/2017/01/17/technology/vine-shuts-down/index.html
- Wayback: https://web.archive.org/web/20140417010951if_/http://www.vine.com/

## The 3 planted demo ideas

**TODO(Davin):** pick ideas we *know* return a great graveyard, for when a judge
asks us to type something and the live one underwhelms.

1.
2.
3.
