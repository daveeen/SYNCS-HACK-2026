"""Enrich 30 more companies from startups_clean.csv and append to startups.enriched.json.

Does NOT touch the 10 records already in the file. shutdown_year overrides below
come from web-verified sources where they disagree with the CSV's own value —
see ENRICHMENT_REPORT notes in the chat for the full discrepancy list.
"""

import json

import pandas as pd

from enrich_top10 import slugify

SELECTED_NAMES = [
    # Information
    "Burbn", "Color Labs", "Factual", "Digg", "Formspring", "RethinkDB", "Secret", "Maker Media",
    # Retail Trade
    "Trunk Club", "Carwoo", "Webvan", "Dot & Bo", "Fashism", "Drizly",
    # Health Care
    "Proteus Digital Health", "CareZone", "Goldfinch Bio", "Jawbone", "HealthSpot", "Zeo", "Arivale",
    # Finance and Insurance
    "LendUp", "Clarity Money", "Isentium", "Bitpass",
    # Manufacturing
    "Lytro", "Aria Insights",
    # Accommodation and Food Services
    "Maple", "Munchery", "Cafe X",
]

# name -> sector, to disambiguate duplicate names present in multiple sector files
SECTOR_OVERRIDE = {
    "Jawbone": "Health Care",
    "Bitpass": "Finance and Insurance",
}

# CSV shutdown_year -> web-verified actual shutdown/death year, where they disagree
YEAR_OVERRIDES = {
    "Color Labs": 2012,
    "Factual": 2020,
    "Digg": 2012,
    "Formspring": 2013,
    "RethinkDB": 2016,
    "Secret": 2015,
    "Trunk Club": 2022,
    "Carwoo": 2014,
    "Webvan": 2001,
    "Dot & Bo": 2016,
    "Fashism": 2013,
    "Drizly": 2024,
    "CareZone": 2023,
    "Clarity Money": 2021,
    "Isentium": 2019,
    "Bitpass": 2007,
    "Maple": 2017,
    "Munchery": 2019,
    "Cafe X": 2020,
}

ENRICHMENT = {
    "Burbn": {
        "tagline": "The multi-feature check-in app that got reduced to its one good idea, and that idea became Instagram",
        "proximateCause": "the app was cluttered and low-engagement as a check-in/gaming/photo product",
        "rootCause": (
            "Burbn combined check-ins, plans-making, and photo-sharing into one app; when "
            "usage data showed photo-sharing was the only feature people actually used, the "
            "founders killed everything else and rebuilt around it as Instagram"
        ),
        "timingNote": (
            "not a timing failure — the founders caught the smartphone-photo wave at exactly "
            "the right moment; the product just had the wrong shape until it was stripped down"
        ),
        "sources": [
            "https://techcrunch.com/2010/11/08/instagram-a-pivotal-pivot/",
            "https://www.startuparchive.org/p/how-kevin-systrom-pivoted-a-failed-check-in-app-into-instagram",
        ],
    },
    "Color Labs": {
        "tagline": "Raised $41M and a wave of hype before anyone understood what the app actually did",
        "proximateCause": "users found the product confusing and didn't adopt it",
        "rootCause": (
            "Color's location-based, contactless photo-sharing concept asked users to learn a "
            "genuinely new social model right as Instagram was winning with a simpler one "
            "(follow people, see their photos), so the pre-launch hype never converted into "
            "real usage"
        ),
        "timingNote": (
            "timing worked against it — it launched right as Instagram was defining and "
            "winning the category with a simpler model, leaving no room for a more confusing "
            "alternative to find its footing"
        ),
        "sources": [
            "https://www.cbsnews.com/news/photo-sharing-site-color-labs-announces-shut-down/",
            "https://medium.com/fail-company/what-happened-to-color-labs-2611bc01b41b",
        ],
    },
    "Factual": {
        "tagline": "A location-data platform that made more sense merged with its biggest rival than standing alone",
        "proximateCause": "merged into Foursquare rather than continuing as an independent competitor",
        "rootCause": (
            "location data became a scale game dominated by Google Maps' first-party data "
            "advantage; two mid-sized independent players (Factual and Foursquare) combining "
            "was a defensive move to pool data and compete, which is itself evidence neither "
            "could win alone"
        ),
        "timingNote": (
            "not a pure timing issue — the location-data category consolidated broadly around "
            "this time as smaller players found they couldn't match Google's scale independently"
        ),
        "sources": [
            "https://techcrunch.com/2020/04/06/foursquare-merges-with-factual",
            "https://siliconangle.com/2020/04/06/foursquare-merges-factual-create-location-data-powerhouse",
        ],
    },
    "Digg": {
        "tagline": "A redesign so unpopular it accidentally launched its own killer",
        "proximateCause": "a 2010 redesign gutted the features and community mechanics users relied on",
        "rootCause": (
            "Digg's 'version 4' relaunch removed the community-driven bury button and shifted "
            "the algorithm to favor publishers over user submissions, alienating the power users "
            "who had built the site's front page; those users mass-migrated to Reddit within "
            "weeks, and the site never recovered before being sold off cheaply"
        ),
        "timingNote": (
            "not a market-timing problem — social news aggregation was thriving; the failure "
            "was a self-inflicted product decision that handed an entire engaged community to "
            "a direct competitor almost overnight"
        ),
        "sources": [
            "https://fourweekmba.com/what-happened-to-digg/",
            "https://www.techradar.com/news/internet/web/whatever-happened-to-digg-1093422",
        ],
    },
    "Formspring": {
        "tagline": "The anonymous Q&A app that couldn't outrun the bullying it enabled",
        "proximateCause": "cyberbullying on the platform, including cases linked to teen suicides, drove users and advertisers away",
        "rootCause": (
            "Formspring's core anonymity feature was also its core liability; once bullying "
            "became severe enough to trigger public backlash, the company had to curb the very "
            "anonymity that made the product distinctive, which killed engagement without "
            "solving the underlying trust problem"
        ),
        "timingNote": (
            "not a timing issue — anonymous Q&A apps had a real audience; the failure was that "
            "the product's defining feature and its worst harm were the same mechanism"
        ),
        "sources": [
            "https://techcrunch.com/2013/03/15/formspring-the-pioneering-anonymous-qa-platform-is-shutting-down/",
            "https://www.failory.com/cemetery/formspring",
        ],
    },
    "RethinkDB": {
        "tagline": "Open-source engineers loved it; almost nobody paid for it",
        "proximateCause": "the company couldn't convert its open-source user base into enough paying enterprise customers",
        "rootCause": (
            "RethinkDB built a technically well-regarded NoSQL database, but the industry's "
            "shift toward cloud-managed database services meant customers increasingly wanted "
            "a hosted product rather than software to run themselves; RethinkDB never built "
            "that hosted business fast enough to fund the underlying open-source engineering"
        ),
        "timingNote": (
            "a timing problem, but not the commonly assumed one — it wasn't beaten by MongoDB "
            "on features, it was overtaken by the broader industry shift to cloud-managed "
            "databases before it built a monetization model around that shift"
        ),
        "sources": [
            "https://www.techrepublic.com/article/rethinkdb-is-dead-and-mongodb-isnt-what-killed-it/",
            "https://siliconangle.com/2016/10/06/rethinkdb-bids-the-developer-community-farewell/",
        ],
    },
    "Secret": {
        "tagline": "Built for candor, shut down by its own worst users",
        "proximateCause": "the app's founder shut it down after concluding it was mostly being used for defamatory and mean-spirited posts",
        "rootCause": (
            "Secret's anonymity model removed accountability at the exact layer (naming real "
            "people) where accountability mattered most, so the app's most viral use case "
            "became targeted harassment rather than the candid, low-stakes sharing it was "
            "designed for"
        ),
        "timingNote": (
            "not a timing problem — anonymous sharing apps had real usage in this window; the "
            "failure was a direct, foreseeable consequence of the product's core design choice, "
            "not a market that wasn't ready"
        ),
        "sources": [
            "https://techcrunch.com/2015/04/29/psst/",
            "https://www.nbcnews.com/tech/social-media/anonymous-sharing-app-secret-shuts-down-n350711",
        ],
    },
    "Maker Media": {
        "tagline": "Make: magazine and Maker Faire ran out of sponsors before they ran out of makers",
        "proximateCause": "the company couldn't cover print and event costs and ceased operations abruptly, laying off all 22 employees",
        "rootCause": (
            "Maker Media depended on corporate sponsorship and investor funding to subsidize "
            "money-losing print publishing and live events; when sponsorship and investor "
            "interest dried up, there was no cash cushion left to keep the business running"
        ),
        "timingNote": (
            "not a timing problem for the underlying maker movement, which stayed active — the "
            "failure was a monetization model (print plus events) that never became "
            "self-sustaining; the founder relaunched a smaller version under new ownership "
            "almost immediately after"
        ),
        "sources": [
            "https://techcrunch.com/2019/06/07/make-magazine-maker-media-layoffs/",
            "https://hackaday.com/2019/06/07/maker-media-ceases-operations/",
        ],
    },
    "Trunk Club": {
        "tagline": "Nordstrom bought the personal stylist that never quite justified the price tag",
        "proximateCause": "Nordstrom shut it down after years of failing to make the service profitable",
        "rootCause": (
            "once acquired, Trunk Club's high-touch, human-stylist model carried costs that "
            "Nordstrom's broader retail business couldn't justify indefinitely, especially as "
            "Stitch Fix scaled a cheaper, more automated version of the same idea"
        ),
        "timingNote": (
            "not primarily a timing issue — personal styling demand was real; the model's "
            "underlying economics (human stylists, physical clubhouses) never matched Stitch "
            "Fix's more automated cost structure"
        ),
        "sources": [
            "https://www.businessoffashion.com/news/retail/nordstrom-is-shuttering-trunk-club/",
            "https://www.retaildive.com/news/what-trunk-clubs-demise-says-about-apparel-subscriptions/624667/",
        ],
    },
    "Carwoo": {
        "tagline": "Tried to make car buying transparent; the dealers who had to cooperate mostly didn't",
        "proximateCause": "ran out of funding after raising $16M total",
        "rootCause": (
            "Carwoo's reverse-auction model depended on dealer participation and cooperation "
            "to work, but dealers had little incentive to compete transparently against each "
            "other on price, so the network never reached the density needed to make the "
            "product reliably useful"
        ),
        "timingNote": (
            "not a timing problem — frustration with opaque car pricing was and is real; the "
            "constraint was structural resistance from the dealer network the product depended "
            "on, not market readiness"
        ),
        "sources": [
            "https://techcrunch.com/2014/01/21/negotiation-free-car-buying-service-carwoo-shuts-down/",
            "https://www.inc.com/jill-krasny/what-went-wrong-at-carwoo.html",
        ],
    },
    "Webvan": {
        "tagline": "Promised grocery delivery to 26 cities in 18 months, and the warehouses bankrupted it first",
        "proximateCause": "burned through its IPO cash building automated warehouses faster than demand could justify",
        "rootCause": (
            "Webvan built capital-intensive automated distribution centers across many cities "
            "simultaneously, betting on rapid demand growth that never materialized at "
            "dot-com-era prices; the fixed costs of that infrastructure outpaced revenue from "
            "actual orders by a huge margin"
        ),
        "timingNote": (
            "a genuine timing problem — broadband penetration, modern logistics tech, and "
            "consumer comfort with online grocery shopping were all roughly a decade away; "
            "Webvan built an operationally sound idea for a market and infrastructure "
            "environment that didn't exist yet"
        ),
        "sources": [
            "https://www.sfgate.com/news/article/Webvan-runs-out-of-gas-Online-grocer-closes-it-2901363.php",
            "https://thebigcollapse.medium.com/webvan-the-1-2-billion-grocery-delivery-dream-that-crashed-before-amazon-could-fly-a8e6ba982a3e",
        ],
    },
    "Dot & Bo": {
        "tagline": "A millennial furniture brand that burned $20M before finding a business model that worked",
        "proximateCause": "ran out of venture funding after acquisition talks fell through",
        "rootCause": (
            "Dot & Bo's curated, story-driven approach to furniture e-commerce required "
            "expensive content production and marketing to compete for the same customers as "
            "Wayfair's much larger inventory and ad spend, and it never found a version of the "
            "model that was profitable at its funding level"
        ),
        "timingNote": (
            "not a timing problem — online furniture retail was a real, growing category "
            "(Wayfair itself succeeded in it); the failure was a curation-heavy cost structure "
            "competing against a scale-first rival"
        ),
        "sources": [
            "https://www.digitalcommerce360.com/2016/09/26/online-only-home-furnishings-retailer-dot-and-bo-shuts-down/",
            "https://techcrunch.com/2016/09/23/dot-bo-closes-down",
        ],
    },
    "Fashism": {
        "tagline": "Ashton Kutcher's backing couldn't turn outfit votes into revenue",
        "proximateCause": "the company couldn't generate enough revenue to sustain operations despite an engaged user base",
        "rootCause": (
            "Fashism built real engagement around a fun, low-stakes social feature (vote on my "
            "outfit) but never built a monetization layer commensurate with that engagement, "
            "so growth in users didn't translate into growth in revenue"
        ),
        "timingNote": (
            "not a timing issue — the core behavior (seeking outfit feedback) has stayed "
            "popular on other platforms; Fashism's specific failure was never solving "
            "monetization, not being early or late to the behavior"
        ),
        "sources": [
            "https://www.forbes.com/sites/lydiadishman/2013/09/28/why-ashton-kutcher-couldnt-save-this-stylish-startup/",
            "https://fashionista.com/2013/09/ashton-kutcher-and-nina-garcia-backed-startup-fashism-shutters",
        ],
    },
    "Drizly": {
        "tagline": "Uber paid $1.1 billion for it, then folded it into Uber Eats three years later",
        "proximateCause": "Uber shut it down to fold alcohol delivery directly into the Uber Eats app",
        "rootCause": (
            "after acquiring Drizly for $1.1B in 2021, Uber decided a standalone "
            "alcohol-delivery app wasn't worth maintaining separately from Uber Eats, "
            "especially given the extra regulatory complexity of alcohol delivery across "
            "different states; folding it into the main app let Uber keep the category "
            "without the standalone overhead"
        ),
        "timingNote": (
            "not really a market-timing failure — alcohol delivery demand was real and "
            "growing; this was a post-acquisition integration decision by the parent company "
            "rather than Drizly failing to find a market"
        ),
        "sources": [
            "https://www.cnn.com/2024/01/15/business/uber-is-shutting-down-drizly/index.html",
            "https://www.modernretail.co/operations/why-uber-decided-to-sunset-drizly/",
        ],
    },
    "Proteus Digital Health": {
        "tagline": "The 'digital pill' pioneer that ran out of cash right as COVID hit",
        "proximateCause": "filed for Chapter 11 bankruptcy after a severe liquidity crisis",
        "rootCause": (
            "Proteus depended on a small number of large pharma partnerships (like its "
            "collaboration with Otsuka) to fund the years of clinical and regulatory work "
            "needed for ingestible sensors; when that partnership scaled back, the company "
            "couldn't raise replacement capital in time, and COVID-19 closed the funding "
            "window completely"
        ),
        "timingNote": (
            "a real timing problem — Proteus needed one more funding round to bridge to "
            "sustainability, and that round's window closed exactly as COVID-19 froze venture "
            "and biotech funding markets in early 2020"
        ),
        "sources": [
            "https://www.cnbc.com/2020/06/15/proteus-digital-health-once-worth-1point5-billion-files-for-chapter-11.html",
            "https://www.fiercebiotech.com/medtech/digital-pill-developer-proteus-files-for-bankruptcy",
        ],
    },
    "CareZone": {
        "tagline": "Sold its best technology to Walmart, then Walmart quietly let the original app die",
        "proximateCause": "Walmart discontinued the consumer app after acquiring CareZone's medication-management technology",
        "rootCause": (
            "CareZone built genuinely useful medication-management tools, but as a standalone "
            "consumer app it couldn't build a durable business around a feature that a company "
            "like Walmart could absorb into its own pharmacy ecosystem; selling the technology "
            "for around $200M was a good outcome for investors, but it meant the original "
            "product had no independent path forward"
        ),
        "timingNote": (
            "not a timing failure — medication management is a persistent need; the product's "
            "fate was tied to being strategically useful to an acquirer rather than being "
            "independently sustainable"
        ),
        "sources": [
            "https://medcitynews.com/2020/06/walmart-buys-carezones-medication-management-technology/",
            "https://www.healthcaredive.com/news/walmart-buys-medication-management-tech-from-startup-carezone/579875/",
        ],
    },
    "Goldfinch Bio": {
        "tagline": "$214M and a Gilead partnership weren't enough to survive one disappointing trial readout",
        "proximateCause": "couldn't raise additional capital after its lead kidney-disease drug posted underwhelming Phase 2 results",
        "rootCause": (
            "Goldfinch built its pipeline around precision treatments for a small number of "
            "rare kidney diseases; when its most advanced drug candidate's Phase 2 data came "
            "back lukewarm, the company lost its clearest path to a near-term win right as the "
            "broader biotech funding environment tightened, leaving no cushion to fund a pivot"
        ),
        "timingNote": (
            "a timing problem — the Phase 2 disappointment landed during a broader downturn in "
            "private biotech funding, so there was no favorable market left to raise a bridge "
            "round through"
        ),
        "sources": [
            "https://www.fiercebiotech.com/biotech/goldfinch-bio-falls-sky-after-failing-find-path-forward-kidney-treatments",
            "https://cen.acs.org/pharmaceuticals/Goldfinch-shuts-down-Karuna-snaps/101/i6",
        ],
    },
    "Jawbone": {
        "tagline": "Raised nearly a billion dollars and still couldn't out-ship Fitbit",
        "proximateCause": "liquidated its assets after running out of cash and options",
        "rootCause": (
            "Jawbone raised enormous amounts of capital relative to its actual product "
            "execution, repeatedly shipping late and dealing with product recalls while Fitbit "
            "and then Apple Watch captured the wearables market it was trying to lead; "
            "commentators called it 'death by overfunding' — the cash cushion let operational "
            "problems compound for years instead of forcing a correction"
        ),
        "timingNote": (
            "not a timing problem — Jawbone was arguably early to wearables; the failure was "
            "years of execution problems (late shipping, recalls) that outlasted its enormous "
            "funding cushion"
        ),
        "sources": [
            "https://www.cnbc.com/2017/07/10/jawbones-demise-a-case-of-death-by-overfunding-in-silicon-valley.html",
            "https://www.fastcompany.com/4042723/fitness-tracker-company-jawbone-is-going-out-of-business",
        ],
    },
    "HealthSpot": {
        "tagline": "Built a telemedicine kiosk network inside pharmacies, then ran out of cash before it could prove out",
        "proximateCause": "ran out of cash and filed for Chapter 7 bankruptcy, abruptly notifying retail partners it was shutting down within days",
        "rootCause": (
            "HealthSpot's kiosk model required expensive hardware deployed and maintained "
            "across physical retail locations (Rite Aid, Cleveland Clinic) well before "
            "software-based telemedicine had proven a cheaper path to the same outcome; the "
            "capital intensity of the hardware rollout outpaced the company's ability to raise "
            "enough follow-on funding"
        ),
        "timingNote": (
            "a real timing problem — HealthSpot bet on hardware kiosks right as smartphone-"
            "based telemedicine apps were becoming viable, a far cheaper way to deliver the "
            "same remote-visit outcome, which undercut the case for expensive physical kiosks "
            "before HealthSpot could scale"
        ),
        "sources": [
            "https://medcitynews.com/2016/01/telemedicine-kiosk-maker-healthspot-shuts-down/",
            "https://www.healthcaredive.com/news/healthspot-files-chapter-7-bankruptcy-shutters-telehealth-kiosks/412325/",
        ],
    },
    "Zeo": {
        "tagline": "Measured your sleep stages with real EEG tech, in a headband nobody wanted to wear to bed",
        "proximateCause": "the business model didn't generate enough margin to sustain the company",
        "rootCause": (
            "Zeo's founder pointed to a 'suboptimal profit margin' business model combined "
            "with a physically invasive headband device and a clunky requirement to manually "
            "log data on a website — friction that limited how many people would actually "
            "adopt and keep using a sleep tracker in this form factor"
        ),
        "timingNote": (
            "a timing problem in the sense that Zeo arrived years before comfortable, "
            "unobtrusive sleep tracking (built into watches and rings) became possible; the "
            "underlying headband-EEG approach was never going to reach mass comfort no matter "
            "how long Zeo waited"
        ),
        "sources": [
            "https://www.mobihealthnews.com/news/exclusive-sleep-coach-company-zeo-shutting-down",
            "https://syneoshealthcommunications.com/blog/zeo-the-big-ugly-retainer-of-self-trackers",
        ],
    },
    "Arivale": {
        "tagline": "Personalized wellness backed by real genomics data, priced out of reach of the people it wanted to help",
        "proximateCause": "shut down abruptly, saying the cost of running the service exceeded what customers could pay",
        "rootCause": (
            "Arivale's coaching was built on genuinely rigorous genetic, blood, and microbiome "
            "testing, but that same rigor made the direct-to-consumer cost structure "
            "unsustainable — the tests needed to power each customer's personalized plan cost "
            "more than a consumer subscription business could recover"
        ),
        "timingNote": (
            "not a timing problem — personalized wellness coaching remains in demand; the "
            "failure was a cost structure (expensive lab testing per customer) that a "
            "direct-to-consumer subscription price could never cover"
        ),
        "sources": [
            "https://www.geekwire.com/2019/scientific-wellness-startup-arivale-closes-abruptly-tragic-end-vision-transform-personal-health/",
            "https://medcitynews.com/2019/04/personalized-health-coaching-startup-arivale-shuts-down/",
        ],
    },
    "LendUp": {
        "tagline": "Marketed itself as the ethical alternative to payday loans, then got shut down for deceptive lending",
        "proximateCause": "the CFPB ordered it to stop making new loans and fined it for repeated deceptive practices",
        "rootCause": (
            "LendUp built its brand around a 'ladder' that promised responsible borrowers "
            "access to larger loans at better rates, but regulators found that promise didn't "
            "hold for tens of thousands of customers in practice; a 2016 CFPB order followed "
            "by continued violations led to a second, terminal enforcement action in 2021 that "
            "ended its ability to lend at all"
        ),
        "timingNote": (
            "not a timing problem — subprime lending demand was constant throughout; the "
            "failure was a sustained gap between LendUp's marketed promise and its actual "
            "practices, which regulators eventually treated as a pattern rather than a "
            "one-time violation"
        ),
        "sources": [
            "https://www.bankingdive.com/news/cfpb-shuts-down-online-lender-lendup/616486/",
            "https://www.consumerfinance.gov/archive/newsroom/cfpb-shutters-lending-by-vc-backed-fintech-for-violating-agency-order/",
        ],
    },
    "Clarity Money": {
        "tagline": "Goldman Sachs bought it, borrowed its best ideas for Marcus, then closed the original app",
        "proximateCause": "Goldman Sachs wound the app down after migrating its most-used features into its own Marcus Insights product",
        "rootCause": (
            "once Goldman acquired Clarity Money in 2018, the app's long-term fate depended on "
            "Goldman's own consumer-banking strategy rather than the product's independent "
            "traction; Goldman ultimately decided to fold the best ideas into its own Marcus "
            "brand instead of continuing to run a separately branded app, ending Clarity "
            "Money's existence"
        ),
        "timingNote": (
            "not a timing failure by Clarity Money's own product-market fit — it was a "
            "strategic decision by its acquirer to consolidate features under its own brand, "
            "which can happen to any acquired app whose parent company reprioritizes"
        ),
        "sources": [
            "https://www.theblock.co/linked/93252/goldman-sachs-fintech-clarity-money-shutter",
            "https://www.fintechfutures.com/paytech/goldman-winds-down-clarity-money-to-focus-on-marcus-insights",
        ],
    },
    "Isentium": {
        "tagline": "Built the sentiment-analysis engine Bloomberg's terminal used, until Bloomberg built its own",
        "proximateCause": "lost its primary distribution channel when Bloomberg ended their partnership and launched a competing in-house app",
        "rootCause": (
            "Isentium's business depended heavily on its integration into the Bloomberg "
            "Terminal to reach financial customers; once Bloomberg decided the "
            "sentiment-analysis feature was valuable enough to build in-house rather than "
            "license, Isentium lost its main distribution channel, and a costly IP lawsuit "
            "against Bloomberg drained resources without winning back that access"
        ),
        "timingNote": (
            "not a timing problem — social-sentiment trading signals remained a real product "
            "category; the failure was structural dependence on a single distribution partner "
            "who had every incentive to eventually build the feature itself"
        ),
        "sources": [
            "https://www.worldipreview.com/news/bloomberg-triumphs-against-ai-company-in-social-media-patent-spat-16903",
            "https://www.integrity-research.com/isentium-launches-sentiment-search-engine-on-bloomberg/",
        ],
    },
    "Bitpass": {
        "tagline": "Tried to make small online payments work years before anyone would pay for small online payments",
        "proximateCause": "shut down and closed all customer accounts after concluding the business wasn't viable",
        "rootCause": (
            "Bitpass explicitly cited competition from Google Checkout, launched the same "
            "year, as undermining its micropayments system; a free, general-purpose payment "
            "option from a company with Google's reach and distribution made a standalone "
            "micropayments-specific startup redundant almost overnight"
        ),
        "timingNote": (
            "a timing problem — Bitpass was pursuing a real need (small digital-content "
            "payments) years before that need had a viable large-scale solution, and when a "
            "well-resourced entrant (Google) finally addressed it, a small independent player "
            "couldn't compete on distribution"
        ),
        "sources": [
            "https://venturebeat.com/business/bitpass-croaks-is-this-the-end-of-micropayments/",
            "https://www.finextra.com/newsarticle/16403/bitpass-bites-the-dust",
        ],
    },
    "Lytro": {
        "tagline": "Reinvented the camera at the sensor level, and still lost to the phone in your pocket",
        "proximateCause": "shut down after failing to build a sustainable market for its light-field cameras",
        "rootCause": (
            "Lytro's light-field sensor technology was a genuine computational-photography "
            "breakthrough, but neither its consumer cameras nor its later pivot to "
            "professional and VR cameras found a market big enough to justify the hardware's "
            "cost; meanwhile smartphone cameras absorbed computational photography features "
            "(like depth-of-field effects) through software, closing the gap Lytro's hardware "
            "was built to fill"
        ),
        "timingNote": (
            "a timing problem — Lytro's core insight (compute depth and focus after the shot) "
            "turned out to be right, but smartphones delivered a software version of that "
            "insight to billions of people before Lytro's specialized hardware could find a "
            "large enough market of its own"
        ),
        "sources": [
            "https://techcrunch.com/2018/03/27/lytro-is-shutting-down",
            "https://www.engadget.com/2018-03-27-lytro-winding-down-business.html",
        ],
    },
    "Aria Insights": {
        "tagline": "Rebranded from hardware to data days before shutting down entirely",
        "proximateCause": "shut down abruptly, just two months after rebranding from CyPhy Works to focus on drone data instead of drone hardware",
        "rootCause": (
            "as CyPhy Works, the company built tethered industrial drones but couldn't build "
            "a hardware business competitive with DJI's manufacturing scale; the last-minute "
            "pivot to a data/analytics business model came too late to raise the funding "
            "needed to make that transition, and the company ran out of runway almost "
            "immediately after rebranding"
        ),
        "timingNote": (
            "a timing problem in its final act — the strategic pivot to a data business might "
            "have been the right long-term direction, but it happened too late relative to the "
            "company's remaining cash to give the new model a real chance to prove itself"
        ),
        "sources": [
            "https://www.therobotreport.com/aria-insights-cyphy-works-shuts-down/",
            "https://techcrunch.com/2019/03/22/drone-analytics-startup-aria-insights-suddenly-shutters",
        ],
    },
    "Maple": {
        "tagline": "Vertically integrated the entire meal-delivery chain, and still lost money on every meal",
        "proximateCause": "sold its technology and team to European rival Deliveroo rather than continue operating independently",
        "rootCause": (
            "Maple owned its own kitchens, delivery fleet, and app to control quality "
            "end-to-end, but that vertical integration meant carrying the full fixed costs of "
            "restaurant-grade food production without restaurant-scale volume; the company was "
            "reportedly losing money on every meal it delivered, and rather than keep funding "
            "that gap, it sold its assets to Deliveroo and its team relocated to London"
        ),
        "timingNote": (
            "not a timing problem — food delivery was a booming, well-timed category; the "
            "failure was a cost structure (owning the entire kitchen-to-doorstep chain) that "
            "couldn't reach profitability at the volumes Maple achieved"
        ),
        "sources": [
            "https://techcrunch.com/2017/05/08/maple-shuts-down/",
            "https://qz.com/972859/inside-maples-improbable-dream-of-delivering-a-better-office-lunch",
        ],
    },
    "Munchery": {
        "tagline": "Chef-prepared meals at scale, undone by aggressive expansion it couldn't afford",
        "proximateCause": "shut down abruptly and filed for Chapter 11 bankruptcy after running out of cash",
        "rootCause": (
            "Munchery expanded into new cities faster than it could establish efficient "
            "kitchen and delivery operations in each one, and increasing competition made it "
            "harder to acquire new customers cheaply enough to offset that expansion cost; by "
            "the time it shut down it owed millions to vendors and gift-card-holding customers "
            "it couldn't pay back"
        ),
        "timingNote": (
            "not a timing problem — meal delivery was a real, growing category (competitors "
            "survived); the failure was expanding faster than the unit economics in each new "
            "market could support"
        ),
        "sources": [
            "https://www.bloomberg.com/news/articles/2019-01-24/munchery-becomes-the-latest-casualty-of-the-food-delivery-shakeout",
            "https://techcrunch.com/2019/03/04/failed-meal-kit-service-munchery-owes-6m-to-gift-card-holders-vendors",
        ],
    },
    "Cafe X": {
        "tagline": "Robot baristas were a great demo and a hard sell at street-level foot traffic",
        "proximateCause": "closed its downtown storefront locations, then its airport locations, as pandemic foot traffic collapsed",
        "rootCause": (
            "Cafe X's downtown San Francisco locations were explicitly described by its own "
            "CEO as running 'prototype' machines meant to learn about customer behavior rather "
            "than a proven profitable format; when the company pivoted to airport locations to "
            "find a better foot-traffic model, the COVID-19 collapse in air travel removed "
            "that foot traffic before the pivot could be judged on its own terms"
        ),
        "timingNote": (
            "a real timing problem in its final act — the pivot to airport kiosks might have "
            "found a workable niche, but the pandemic's collapse in air travel hit right as "
            "that new bet was being placed"
        ),
        "sources": [
            "https://www.axios.com/2020/01/07/cafe-x-shuts-some-of-its-robot-coffee-shops",
            "https://thespoon.tech/cafe-x-shuts-down-its-three-downtown-san-francisco-locations/",
        ],
    },
}


def main():
    df = pd.read_csv("data/clean/startups_clean.csv")

    rows = []
    for name in SELECTED_NAMES:
        candidates = df[df["name"] == name]
        if name in SECTOR_OVERRIDE:
            candidates = candidates[candidates["sector"] == SECTOR_OVERRIDE[name]]
        rows.append(candidates.iloc[0])

    new_records = []
    for row in rows:
        name = row["name"]
        extra = ENRICHMENT[name]
        died_year = YEAR_OVERRIDES.get(name, int(row["shutdown_year"]))
        new_records.append(
            {
                "id": slugify(name),
                "name": name,
                "tagline": extra["tagline"],
                "description": row["what_they_did"],
                "industry": row["sector"],
                "foundedYear": int(row["founded_year"]),
                "diedYear": died_year,
                "fundingRaised": row["how_much_they_raised"],
                "proximateCause": extra["proximateCause"],
                "rootCause": extra["rootCause"],
                "timingNote": extra["timingNote"],
                "lesson": row["takeaway"],
                "sources": extra["sources"],
                "waybackUrl": "",
            }
        )

    with open("data/startups.enriched.json", "r", encoding="utf-8") as f:
        existing = json.load(f)

    existing_ids = {r["id"] for r in existing}
    dupes = [r["id"] for r in new_records if r["id"] in existing_ids]
    if dupes:
        raise SystemExit(f"refusing to append, id collision with existing records: {dupes}")

    combined = existing + new_records

    with open("data/startups.enriched.json", "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2)
        f.write("\n")

    print(f"appended {len(new_records)} records ({len(existing)} -> {len(combined)} total)")

    year_corrected = [n for n in SELECTED_NAMES if n in YEAR_OVERRIDES]
    print(f"\nshutdown_year corrected for {len(year_corrected)}/{len(SELECTED_NAMES)} new records:")
    for n in year_corrected:
        orig = df[df['name'] == n].iloc[0]['shutdown_year']
        print(f"  {n}: CSV={orig} -> verified={YEAR_OVERRIDES[n]}")


if __name__ == "__main__":
    main()