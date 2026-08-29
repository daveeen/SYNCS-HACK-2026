"""One-off enrichment of the top-10 most complete rows into the FailedStartup shape."""

import json
import re

import pandas as pd

ENRICHMENT = {
    "Airy Labs": {
        "tagline": "Educational games for kids, minus the focus to make any of them great",
        "proximateCause": "ran out of cash",
        "rootCause": (
            "spread itself across too many game titles at once instead of focusing on "
            "one, burning cash on breadth instead of depth"
        ),
        "timingNote": (
            "not a timing problem — the mobile app boom was real and happening; the "
            "failure was self-inflicted execution sprawl, not the market being unready"
        ),
        "sources": [
            "https://techcrunch.com/2012/02/11/airy-labs-big-cuts/",
            "http://hackeducation.com/2012/02/11/airy-labs-and-ed-tech-startups",
        ],
    },
    "Bebo": {
        "tagline": "The UK's biggest social network, bought once to save it and once just to strip it for esports parts",
        "proximateCause": "users and cultural relevance had already moved to Facebook years before Twitch's 2019 acquisition",
        "rootCause": (
            "AOL's 2008 acquisition mismanaged the platform and starved it of investment "
            "while Facebook's network effects compounded internationally; by the time it was "
            "sold to Twitch for esports in 2019, it was a spare-parts deal for the brand, not a comeback"
        ),
        "timingNote": (
            "timing mattered — Bebo peaked right before Facebook opened to the public and "
            "scaled internationally; AOL's neglect meant it had no answer when that wave hit, "
            "and every later revival attempt landed in a market Facebook already owned"
        ),
        "sources": [
            "https://techcrunch.com/2019/06/18/amazon-twitch-bebo-esports/",
            "https://www.geekwire.com/2019/amazons-twitch-snaps-former-social-media-darling-bebo-grow-esports-presence/",
        ],
    },
    "Auctionata": {
        "tagline": "Brought the auction house online, then couldn't make the economics or the trust hold up",
        "proximateCause": "insolvency driven by high operating costs",
        "rootCause": (
            "the white-glove, high-touch auction model (in-house experts, live-streamed "
            "auctions, authentication) carried costs that didn't scale, and a public "
            "valuation/authentication scandal undermined the trust the luxury-auction "
            "business model depended on"
        ),
        "timingNote": (
            "not a timing problem — online luxury auctions were a real, growing category; "
            "the failure was operational (cost structure) and reputational (scandal), not "
            "the market being unready"
        ),
        "sources": [
            "https://news.artnet.com/art-world/auctionata-insolvency-proceedings-822965",
            "https://news.artnet.com/market/auctionata-closes-insolvency-proceedings-874583",
        ],
    },
    "Boxed": {
        "tagline": "Costco without the membership fee, but also without Amazon's shipping scale",
        "proximateCause": "filed for bankruptcy under the weight of shipping and fulfillment costs",
        "rootCause": (
            "the bulk-buying convenience model required expensive last-mile shipping of "
            "heavy, low-margin bulk goods — a cost structure Amazon could absorb at its "
            "scale but Boxed couldn't match without it"
        ),
        "timingNote": (
            "not primarily a timing issue — bulk e-commerce demand existed throughout; the "
            "failure was a structural cost disadvantage against a competitor with vastly "
            "greater shipping scale, not a market that closed"
        ),
        "sources": [
            "https://techcrunch.com/2023/08/18/online-wholesaler-boxed-acquired-after-filing-for-bankruptcy/",
            "https://www.grocerydive.com/news/boxed-files-chapter-11-bankruptcy/646606/",
        ],
    },
    "Scanadu": {
        "tagline": "Built a real-life tricorder, then the FDA said the science project had to end",
        "proximateCause": "the FDA required Scanadu to deactivate its Scout devices once its investigational study concluded",
        "rootCause": (
            "Scanadu sold and shipped the Scout as a consumer device funded via crowdfunding "
            "while it was still legally an investigational device under an IRB-approved study; "
            "when the study reached its endpoint, FDA rules forced it to shut down devices "
            "customers had already paid for and were using, with no cleared consumer product "
            "ready to replace it"
        ),
        "timingNote": (
            "a timing mismatch, but not a market one — Scanadu got ahead of its own regulatory "
            "pathway, shipping to consumers before it had a clear route to full FDA clearance, "
            "so the regulatory clock ran out before the business model matured"
        ),
        "sources": [
            "https://techcrunch.com/2016/12/13/fda-orders-scanadu-to-shut-down-support-for-its-scout-device-and-customers-are-mad",
            "https://medcitynews.com/2016/12/scanadu-shutting-down-tricorder/",
        ],
    },
    "Basis": {
        "tagline": "A promising health smartwatch, discontinued after it started burning wrists",
        "proximateCause": "Intel issued a full recall and shut down the Basis Peak after reports of overheating and skin burns",
        "rootCause": (
            "the watch's continuous LED heart-rate sensor could overheat under certain "
            "conditions and cause burns; once Intel couldn't engineer a fix, it was cheaper "
            "and safer to recall and discontinue the whole product line than keep competing "
            "against Fitbit and Apple Watch with an unresolved safety flaw"
        ),
        "timingNote": (
            "not a timing problem — wearable fitness tracking was a booming category at the "
            "time; the failure was a hardware safety defect that had nothing to do with "
            "market readiness"
        ),
        "sources": [
            "https://techcrunch.com/2016/08/03/basis-peak-watches-recalled-due-to-overheating/",
            "https://www.cnbc.com/2016/08/03/intel-recalls-basic-peak-smartwatch-over-safety-overheating-fears.html",
        ],
    },
    "Simple": {
        "tagline": "One of the first neobanks, killed by its parent company's own acquisition, not by the market",
        "proximateCause": "shut down after its acquirer BBVA was itself acquired and exited the business",
        "rootCause": (
            "Simple ceded strategic control by selling to BBVA early, and once BBVA was "
            "acquired by PNC, Simple had no independent path forward while faster-growing "
            "independents like Chime and Ally captured the neobank market on their own terms"
        ),
        "timingNote": (
            "timing worked against it in a specific way — it was early to neobanking but "
            "lost strategic independence just as the category was taking off, so it couldn't "
            "capture the growth its early-mover position should have earned"
        ),
        "sources": [
            "https://techcrunch.com/2021/01/07/bbva-says-that-it-is-shutting-down-banking-app-simple-will-transfer-users-to-bbva-usa/",
            "https://www.americanbanker.com/news/bbva-usa-shuts-down-neobank-simple",
        ],
    },
    "Pawngo": {
        "tagline": "Took pawnshops online, but the customers who use pawnshops wanted them in person",
        "proximateCause": "couldn't generate enough loan volume to sustain the business",
        "rootCause": (
            "online pawn lending removed the in-person trust and immediacy that make "
            "pawnshops useful to their core customers, so it competed against an entrenched "
            "offline habit without offering a compelling enough advantage to shift behavior"
        ),
        "timingNote": (
            "not a timing issue — the niche itself was structurally small and tied to "
            "in-person behavior; waiting longer wouldn't have grown the addressable market"
        ),
        "sources": [
            "https://www.crunchbase.com/organization/pawngo",
        ],
    },
    "Anki": {
        "tagline": "Built genuinely impressive robots, at a price no toy aisle could sustain",
        "proximateCause": "high per-unit hardware costs made the product too expensive to compete at consumer toy price points",
        "rootCause": (
            "building AI-driven robotics into a toy meant hardware costs that couldn't come "
            "down to compete with cheaper, established players like Lego and Sphero, so its "
            "price stayed too high for the mass-market toy audience it needed"
        ),
        "timingNote": (
            "not a timing failure — the cost structure of the hardware was the constraint "
            "at any point in time, not a market that wasn't ready yet"
        ),
        "sources": [
            "https://www.axios.com/2019/04/29/robotics-startup-anki-shutting-down-despite-200m-in-funding",
            "https://www.therobotreport.com/anki-consumer-robotics-maker-shuts-down/",
        ],
    },
    "Flowtab": {
        "tagline": "Wanted to change how you order a drink; bars just kept using their POS systems",
        "proximateCause": "low adoption among bars and customers",
        "rootCause": (
            "asked bars to change ordering behavior and adopt a new app layer on top of "
            "existing point-of-sale systems, and neither bars nor customers saw enough "
            "incremental convenience to justify switching from the POS systems already in place"
        ),
        "timingNote": (
            "not a timing problem — the friction was behavioral and structural (integrating "
            "with existing POS systems), not a market condition that would resolve itself "
            "with more time"
        ),
        "sources": [
            "https://www.cbinsights.com/company/flowtab",
            "https://www.failory.com/cemetery/flowtab",
        ],
    },
}

SELECTED_NAMES = [
    "Airy Labs", "Bebo",             # Information
    "Auctionata", "Boxed",           # Retail Trade
    "Scanadu", "Basis",              # Health Care
    "Simple", "Pawngo",              # Finance and Insurance
    "Anki",                          # Manufacturing
    "Flowtab",                       # Accommodation and Food Services
]


def slugify(name):
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def main():
    df = pd.read_csv("data/clean/startups_clean.csv")
    selected = df[df["name"].isin(SELECTED_NAMES)].set_index("name").loc[SELECTED_NAMES].reset_index()

    records = []
    for _, row in selected.iterrows():
        extra = ENRICHMENT[row["name"]]
        records.append(
            {
                "id": slugify(row["name"]),
                "name": row["name"],
                "tagline": extra["tagline"],
                "description": row["what_they_did"],
                "industry": row["sector"],
                "foundedYear": int(row["founded_year"]),
                "diedYear": int(row["shutdown_year"]),
                "fundingRaised": row["how_much_they_raised"],
                "proximateCause": extra["proximateCause"],
                "rootCause": extra["rootCause"],
                "timingNote": extra["timingNote"],
                "lesson": row["takeaway"],
                "sources": extra["sources"],
                "waybackUrl": "",
            }
        )

    with open("data/startups.enriched.json", "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
        f.write("\n")

    print(f"wrote {len(records)} records to data/startups.enriched.json")


if __name__ == "__main__":
    main()