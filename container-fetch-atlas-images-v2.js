// One-off script (v2 - tarball based, works around raw.githubusercontent.com
// being unreachable from this container). Downloads the whole repo as a
// tarball from codeload.github.com (confirmed reachable), extracts it with
// the system `tar`, then copies each atlas image from the extracted tree
// into UPLOAD_DIR.
// Run with: node container-fetch-atlas-images-v2.js
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/data/uploads";
const files = [
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co0-p0.jpeg",
    "dest": "exhibition/esm/co0-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co0-p1.jpeg",
    "dest": "exhibition/esm/co0-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co0-p2.jpeg",
    "dest": "exhibition/esm/co0-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co0-p3.jpeg",
    "dest": "exhibition/esm/co0-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co0-p4.jpeg",
    "dest": "exhibition/esm/co0-p4.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co0-p5.jpeg",
    "dest": "exhibition/esm/co0-p5.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co1-p0.jpeg",
    "dest": "exhibition/araafzar/co1-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co1-p1.jpeg",
    "dest": "exhibition/araafzar/co1-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co1-p2.jpeg",
    "dest": "exhibition/araafzar/co1-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co1-p3.jpeg",
    "dest": "exhibition/araafzar/co1-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co1-p4.jpeg",
    "dest": "exhibition/araafzar/co1-p4.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co1-p5.jpeg",
    "dest": "exhibition/araafzar/co1-p5.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co2-p0.jpeg",
    "dest": "exhibition/arad/co2-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co2-p1.jpeg",
    "dest": "exhibition/arad/co2-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co2-p2.jpeg",
    "dest": "exhibition/arad/co2-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co4-p0.jpeg",
    "dest": "exhibition/barsam/co4-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co5-p0.jpeg",
    "dest": "exhibition/pouria/co5-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co7-p0.png",
    "dest": "exhibition/parspooyesh/co7-p0.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co7-p1.png",
    "dest": "exhibition/parspooyesh/co7-p1.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co7-p2.png",
    "dest": "exhibition/parspooyesh/co7-p2.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co7-p3.jpeg",
    "dest": "exhibition/parspooyesh/co7-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co8-p0.jpeg",
    "dest": "exhibition/pazh/co8-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co9-p0.jpeg",
    "dest": "exhibition/pesaba/co9-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co9-p1.jpeg",
    "dest": "exhibition/pesaba/co9-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co9-p2.jpeg",
    "dest": "exhibition/pesaba/co9-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co10-p0.jpeg",
    "dest": "exhibition/pegah/co10-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co10-p2.jpeg",
    "dest": "exhibition/pegah/co10-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co10-p3.jpeg",
    "dest": "exhibition/pegah/co10-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co10-p1.jpeg",
    "dest": "exhibition/pegah/co10-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co11-p0.jpeg",
    "dest": "exhibition/payamgostar/co11-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co11-p1.jpeg",
    "dest": "exhibition/payamgostar/co11-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co11-p2.jpeg",
    "dest": "exhibition/payamgostar/co11-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co11-p3.jpeg",
    "dest": "exhibition/payamgostar/co11-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co11-p4.jpeg",
    "dest": "exhibition/payamgostar/co11-p4.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co12-p0.png",
    "dest": "exhibition/soroush/co12-p0.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co12-p1.jpeg",
    "dest": "exhibition/soroush/co12-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co12-p2.png",
    "dest": "exhibition/soroush/co12-p2.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co13-p0.jpeg",
    "dest": "exhibition/tarsim/co13-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co13-p1.jpeg",
    "dest": "exhibition/tarsim/co13-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co14-p0.jpeg",
    "dest": "exhibition/daneshavaran/co14-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co14-p1.jpeg",
    "dest": "exhibition/daneshavaran/co14-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co14-p2.jpeg",
    "dest": "exhibition/daneshavaran/co14-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co15-p0.png",
    "dest": "exhibition/sigma/co15-p0.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co16-p0.jpeg",
    "dest": "exhibition/artian/co16-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co16-p1.jpeg",
    "dest": "exhibition/artian/co16-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co16-p2.jpeg",
    "dest": "exhibition/artian/co16-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co17-p0.jpeg",
    "dest": "exhibition/samatoos/co17-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co18-p0.jpeg",
    "dest": "exhibition/lotus/co18-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co19-p0.jpeg",
    "dest": "exhibition/mahdban/co19-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co19-p1.jpeg",
    "dest": "exhibition/mahdban/co19-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co19-p2.jpeg",
    "dest": "exhibition/mahdban/co19-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co19-p3.jpeg",
    "dest": "exhibition/mahdban/co19-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co19-p4.jpeg",
    "dest": "exhibition/mahdban/co19-p4.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co19-p5.jpeg",
    "dest": "exhibition/mahdban/co19-p5.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co20-p0.jpeg",
    "dest": "exhibition/teamyar/co20-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co20-p1.jpeg",
    "dest": "exhibition/teamyar/co20-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co20-p2.jpeg",
    "dest": "exhibition/teamyar/co20-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co20-p3.jpeg",
    "dest": "exhibition/teamyar/co20-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co20-p4.jpeg",
    "dest": "exhibition/teamyar/co20-p4.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co21-p0.jpeg",
    "dest": "exhibition/kpp/co21-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co21-p1.jpeg",
    "dest": "exhibition/kpp/co21-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co22-p0.jpeg",
    "dest": "exhibition/algocom/co22-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co22-p1.jpeg",
    "dest": "exhibition/algocom/co22-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co22-p2.jpeg",
    "dest": "exhibition/algocom/co22-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co23-p0.jpeg",
    "dest": "exhibition/ranir/co23-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co23-p1.jpeg",
    "dest": "exhibition/ranir/co23-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co26-p0.jpeg",
    "dest": "exhibition/sata/co26-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co26-p1.jpeg",
    "dest": "exhibition/sata/co26-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co26-p2.jpeg",
    "dest": "exhibition/sata/co26-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co26-p3.jpeg",
    "dest": "exhibition/sata/co26-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co27-p0.jpeg",
    "dest": "exhibition/shabakeafzar/co27-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co28-p0.jpeg",
    "dest": "exhibition/noafarin/co28-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co28-p1.jpeg",
    "dest": "exhibition/noafarin/co28-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co28-p2.jpeg",
    "dest": "exhibition/noafarin/co28-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co28-p3.png",
    "dest": "exhibition/noafarin/co28-p3.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co29-p0.jpeg",
    "dest": "exhibition/white/co29-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co29-p1.jpeg",
    "dest": "exhibition/white/co29-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co29-p2.jpeg",
    "dest": "exhibition/white/co29-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co29-p3.jpeg",
    "dest": "exhibition/white/co29-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co30-p0.png",
    "dest": "exhibition/toranj/co30-p0.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co30-p1.png",
    "dest": "exhibition/toranj/co30-p1.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co30-p2.jpeg",
    "dest": "exhibition/toranj/co30-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co30-p3.png",
    "dest": "exhibition/toranj/co30-p3.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co31-p0.jpeg",
    "dest": "exhibition/danialmoj/co31-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co31-p1.jpeg",
    "dest": "exhibition/danialmoj/co31-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co32-p0.jpeg",
    "dest": "exhibition/tasnim/co32-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co32-p1.jpeg",
    "dest": "exhibition/tasnim/co32-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co32-p2.jpeg",
    "dest": "exhibition/tasnim/co32-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co32-p3.jpeg",
    "dest": "exhibition/tasnim/co32-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co33-p0.jpeg",
    "dest": "exhibition/ftsv/co33-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co33-p1.jpeg",
    "dest": "exhibition/ftsv/co33-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co34-p0.jpeg",
    "dest": "exhibition/basamad/co34-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co34-p1.jpeg",
    "dest": "exhibition/basamad/co34-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co34-p2.jpeg",
    "dest": "exhibition/basamad/co34-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co34-p3.jpeg",
    "dest": "exhibition/basamad/co34-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co34-p4.jpeg",
    "dest": "exhibition/basamad/co34-p4.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co34-p5.jpeg",
    "dest": "exhibition/basamad/co34-p5.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co35-p0.jpeg",
    "dest": "exhibition/seraj/co35-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co35-p1.jpeg",
    "dest": "exhibition/seraj/co35-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co35-p2.jpeg",
    "dest": "exhibition/seraj/co35-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co35-p3.jpeg",
    "dest": "exhibition/seraj/co35-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co36-p0.jpeg",
    "dest": "exhibition/controlp/co36-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co36-p1.jpeg",
    "dest": "exhibition/controlp/co36-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co36-p2.jpeg",
    "dest": "exhibition/controlp/co36-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co36-p3.jpeg",
    "dest": "exhibition/controlp/co36-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co37-p0.png",
    "dest": "exhibition/greenweb/co37-p0.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co37-p1.png",
    "dest": "exhibition/greenweb/co37-p1.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co37-p2.png",
    "dest": "exhibition/greenweb/co37-p2.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co38-p0.jpeg",
    "dest": "exhibition/karatel/co38-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co38-p1.jpeg",
    "dest": "exhibition/karatel/co38-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co38-p3.jpeg",
    "dest": "exhibition/karatel/co38-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co40-p0.jpeg",
    "dest": "exhibition/mahak/co40-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co40-p1.jpeg",
    "dest": "exhibition/mahak/co40-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co40-p2.jpeg",
    "dest": "exhibition/mahak/co40-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co40-p3.jpeg",
    "dest": "exhibition/mahak/co40-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co40-p4.jpeg",
    "dest": "exhibition/mahak/co40-p4.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co40-p5.jpeg",
    "dest": "exhibition/mahak/co40-p5.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co42-p0.jpeg",
    "dest": "exhibition/amnpardaz/co42-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co42-p1.jpeg",
    "dest": "exhibition/amnpardaz/co42-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co42-p2.jpeg",
    "dest": "exhibition/amnpardaz/co42-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co42-p3.jpeg",
    "dest": "exhibition/amnpardaz/co42-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co43-p0.png",
    "dest": "exhibition/nbg/co43-p0.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co43-p1.jpeg",
    "dest": "exhibition/nbg/co43-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co43-p2.jpeg",
    "dest": "exhibition/nbg/co43-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co43-p3.png",
    "dest": "exhibition/nbg/co43-p3.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co44-p0.jpeg",
    "dest": "exhibition/nasim/co44-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co45-p0.png",
    "dest": "exhibition/parspack/co45-p0.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co45-p1.jpeg",
    "dest": "exhibition/parspack/co45-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co45-p2.jpeg",
    "dest": "exhibition/parspack/co45-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co45-p3.png",
    "dest": "exhibition/parspack/co45-p3.png"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co46-p0.jpeg",
    "dest": "exhibition/hamianfan/co46-p0.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co46-p1.jpeg",
    "dest": "exhibition/hamianfan/co46-p1.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co46-p2.jpeg",
    "dest": "exhibition/hamianfan/co46-p2.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co46-p3.jpeg",
    "dest": "exhibition/hamianfan/co46-p3.jpeg"
  },
  {
    "url": "https://raw.githubusercontent.com/daneshavaran2/parkfava/main/scripts/atlas-images/co47-p0.jpeg",
    "dest": "exhibition/bita/co47-p0.jpeg"
  }
];

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const TARBALL_URL = "https://codeload.github.com/daneshavaran2/parkfava/tar.gz/refs/heads/main";
const TMP_DIR = "/tmp/atlas-repo";

async function main() {
  console.log("Downloading repo tarball...");
  const res = await fetch(TARBALL_URL);
  if (!res.ok) {
    console.error("FAILED to download tarball:", res.status);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tarPath = path.join(TMP_DIR, "repo.tar.gz");
  fs.writeFileSync(tarPath, buf);
  console.log(`Downloaded ${buf.length} bytes. Extracting...`);

  execFileSync("tar", ["-xzf", tarPath, "-C", TMP_DIR]);

  const entries = fs.readdirSync(TMP_DIR).filter((e) => e !== "repo.tar.gz");
  const repoRoot = path.join(TMP_DIR, entries[0]);
  const imagesDir = path.join(repoRoot, "scripts", "atlas-images");
  console.log("Extracted to", repoRoot);

  let ok = 0, fail = 0;
  for (const f of files) {
    try {
      const filename = f.url.split("/").pop();
      const src = path.join(imagesDir, filename);
      const dest = path.join(UPLOAD_DIR, f.dest);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      ok++;
    } catch (e) {
      console.error("FAIL", f.dest, e.message);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} copied, ${fail} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
