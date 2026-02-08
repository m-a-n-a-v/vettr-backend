import { db } from '../../config/database.js';
import { filings, stocks } from '../schema/index.js';
import { eq } from 'drizzle-orm';

/**
 * Filing seed data for 25 Canadian pilot stocks.
 * 3 filings per stock (75 total) with realistic types, titles, summaries, and dates.
 * Filing types: MD&A, Press Release, Financial Statements, Technical Report
 */

interface FilingSeed {
  ticker: string;
  filings: {
    type: string;
    title: string;
    date: Date;
    summary: string;
    isMaterial: boolean;
    sourceUrl: string | null;
  }[];
}

const filingSeedData: FilingSeed[] = [
  {
    ticker: 'NXE',
    filings: [
      {
        type: 'Technical Report',
        title: 'NI 43-101 Technical Report - Rook I Uranium Project',
        date: new Date('2025-11-15'),
        summary: 'Updated NI 43-101 technical report for the Rook I uranium project in the Athabasca Basin, Saskatchewan. Report confirms expanded mineral resource estimates and supports feasibility study conclusions.',
        isMaterial: true,
        sourceUrl: 'https://sedarplus.ca/nxe/technical-report-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Interim Financial Statements',
        date: new Date('2025-10-28'),
        summary: 'Third quarter 2025 unaudited interim financial statements showing continued investment in Rook I development. Cash position remains strong at $420M with development milestones on track.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'NexGen Announces Positive Environmental Assessment Decision',
        date: new Date('2025-09-12'),
        summary: 'NexGen Energy received a positive decision on the federal environmental assessment for the Rook I project, a key regulatory milestone for project advancement.',
        isMaterial: true,
        sourceUrl: 'https://nexgenenergy.ca/news/ea-decision-2025',
      },
    ],
  },
  {
    ticker: 'ARIS',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-10'),
        summary: 'Q3 2025 MD&A highlighting gold production of 62,500 oz from Segovia and Marmato operations. All-in sustaining costs of $1,085/oz, below guidance range.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Aris Mining Reports Record Quarterly Gold Production',
        date: new Date('2025-10-15'),
        summary: 'Aris Mining announced record quarterly gold production driven by higher grades at Segovia operations and successful ramp-up of underground development at Marmato.',
        isMaterial: true,
        sourceUrl: 'https://arismining.com/news/q3-production-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Condensed Interim Financial Statements',
        date: new Date('2025-08-14'),
        summary: 'Second quarter financial statements showing revenue of $185M and adjusted EBITDA of $78M. Strong free cash flow generation supporting ongoing expansion activities.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'LUN',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements and Notes',
        date: new Date('2025-10-30'),
        summary: 'Consolidated financial statements for Q3 2025. Revenue of $2.1B driven by strong copper and zinc prices. Candelaria and Neves-Corvo operations performing at or above guidance.',
        isMaterial: true,
        sourceUrl: 'https://lundinmining.com/investors/financials-q3-2025',
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-10-30'),
        summary: 'Comprehensive operational review covering Candelaria, Chapada, Eagle, Neves-Corvo, and Zinkgruvan mines. Production guidance maintained for full year 2025.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Lundin Mining Completes Acquisition of Caserones Copper Mine',
        date: new Date('2025-09-05'),
        summary: 'Lundin Mining completed the previously announced acquisition of the Caserones copper-molybdenum mine in Chile, adding approximately 120,000 tonnes of annual copper production capacity.',
        isMaterial: true,
        sourceUrl: 'https://lundinmining.com/news/caserones-close-2025',
      },
    ],
  },
  {
    ticker: 'FM',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-05'),
        summary: 'Q3 2025 MD&A reporting on Cobre Panama restart progress and Kansanshi S3 expansion. Net debt reduction of $450M year-to-date through asset sales and operational cash flow.',
        isMaterial: true,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'First Quantum Provides Cobre Panama Restart Update',
        date: new Date('2025-10-01'),
        summary: 'First Quantum Minerals provided an update on the Cobre Panama mine restart negotiations with the Government of Panama, outlining key terms under discussion.',
        isMaterial: true,
        sourceUrl: 'https://first-quantum.com/news/cobre-panama-update-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Interim Financial Statements',
        date: new Date('2025-08-08'),
        summary: 'Q2 financial statements reflecting Kansanshi and Sentinel operations in Zambia. Total copper production of 95,000 tonnes for the quarter.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'TKO',
    filings: [
      {
        type: 'Press Release',
        title: 'Taseko Mines Announces Gibraltar Mine Production Results',
        date: new Date('2025-11-20'),
        summary: 'Taseko reported Q3 copper production of 28 million lbs from Gibraltar mine operations in British Columbia. Mill throughput averaged 85,000 tonnes per day.',
        isMaterial: false,
        sourceUrl: 'https://tasekomines.com/news/q3-production-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Condensed Financial Statements',
        date: new Date('2025-10-25'),
        summary: 'Third quarter financial results with revenue of $210M and operating cash flow of $65M. Continued investment in Florence Copper project development in Arizona.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Technical Report',
        title: 'Florence Copper Project - Updated Feasibility Study',
        date: new Date('2025-08-30'),
        summary: 'Updated feasibility study for Florence Copper in-situ recovery project. After-tax NPV of $920M at $3.75/lb copper with 18-year mine life and low capital intensity.',
        isMaterial: true,
        sourceUrl: 'https://tasekomines.com/florence-copper-feasibility-2025',
      },
    ],
  },
  {
    ticker: 'ERO',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements',
        date: new Date('2025-11-12'),
        summary: 'Ero Copper reported strong Q3 results with copper production from MCSA Mining Complex in Brazil. Tucuma project commissioning progressing on schedule.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-12'),
        summary: 'Operational review highlighting record copper production at Caraiba operations and Tucuma copper project nearing commercial production milestone.',
        isMaterial: true,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Ero Copper Declares Commercial Production at Tucuma',
        date: new Date('2025-09-18'),
        summary: 'Ero Copper declared commercial production at the Tucuma copper project in Para State, Brazil, marking a transformational milestone for the company.',
        isMaterial: true,
        sourceUrl: 'https://erocopper.com/news/tucuma-commercial-production',
      },
    ],
  },
  {
    ticker: 'CS',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-08'),
        summary: 'Q3 2025 review covering Pinto Valley, Cozamin, Mantos Blancos, and Mantoverde operations. Mantoverde development project achieving nameplate capacity.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Capstone Copper Achieves Mantoverde Nameplate Throughput',
        date: new Date('2025-10-03'),
        summary: 'Capstone Copper announced that the Mantoverde Development Project in Chile has achieved sustained nameplate throughput of 32,000 tonnes per day at the concentrator.',
        isMaterial: true,
        sourceUrl: 'https://capstonecopper.com/news/mantoverde-nameplate-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Interim Financial Statements',
        date: new Date('2025-08-12'),
        summary: 'Q2 consolidated financial statements showing combined copper production of 48,000 tonnes. Revenue and EBITDA exceeded analyst expectations.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'MAG',
    filings: [
      {
        type: 'Technical Report',
        title: 'NI 43-101 Technical Report - Juanicipio Mine',
        date: new Date('2025-11-01'),
        summary: 'Updated technical report for the Juanicipio silver-gold mine in Fresnillo, Mexico. Joint venture with Fresnillo PLC reports expanding high-grade mineral reserves.',
        isMaterial: true,
        sourceUrl: 'https://magsilver.com/juanicipio-technical-report-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements',
        date: new Date('2025-10-22'),
        summary: 'Q3 financial results reflecting MAG Silver share of Juanicipio production: 2.8M oz silver equivalent. Cash position of $95M with no debt.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'MAG Silver Reports New High-Grade Discovery at Juanicipio',
        date: new Date('2025-09-08'),
        summary: 'MAG Silver announced a new high-grade silver discovery at the Juanicipio mine, with drill intercepts exceeding 1,000 g/t silver over 5 metres in the Valdecanas vein system.',
        isMaterial: true,
        sourceUrl: 'https://magsilver.com/news/discovery-2025',
      },
    ],
  },
  {
    ticker: 'FVI',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-14'),
        summary: 'Q3 MD&A covering Seguela gold mine in Cote d\'Ivoire, Lindero in Argentina, Caylloma in Peru, and San Jose in Mexico. Total gold equivalent production of 115,000 oz.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Fortuna Mining Increases Annual Production Guidance',
        date: new Date('2025-10-10'),
        summary: 'Fortuna Mining increased full-year 2025 gold equivalent production guidance to 440,000-460,000 oz based on outperformance at Seguela and Lindero mines.',
        isMaterial: true,
        sourceUrl: 'https://fortunamining.com/news/guidance-increase-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Condensed Financial Statements',
        date: new Date('2025-08-09'),
        summary: 'Second quarter results with revenue of $225M and free cash flow of $72M. Seguela mine continues to exceed feasibility study expectations.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'WPM',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Consolidated Financial Statements',
        date: new Date('2025-11-07'),
        summary: 'Wheaton Precious Metals reported record revenue of $380M in Q3 2025. Attributable gold equivalent production of 165,000 oz from streaming portfolio of 23 operating mines.',
        isMaterial: true,
        sourceUrl: 'https://wheatonpm.com/investors/q3-2025-financials',
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-07'),
        summary: 'Comprehensive review of streaming portfolio performance. Salobo, Penasquito, and Constancia streams contributing largest production volumes.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Wheaton Precious Metals Announces New Stream Agreement',
        date: new Date('2025-09-22'),
        summary: 'Wheaton announced a new precious metals streaming agreement with upfront consideration of $350M for a gold and silver stream on a development-stage project in South America.',
        isMaterial: true,
        sourceUrl: 'https://wheatonpm.com/news/new-stream-2025',
      },
    ],
  },
  {
    ticker: 'AEM',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements and Notes',
        date: new Date('2025-10-31'),
        summary: 'Agnico Eagle reported record quarterly gold production of 930,000 oz. Revenue of $2.8B with all-in sustaining costs of $1,150/oz, well below industry average.',
        isMaterial: true,
        sourceUrl: 'https://agnicoeagle.com/investors/q3-2025',
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-10-31'),
        summary: 'Detailed operational review of Canadian Malartic, Detour Lake, Meadowbank, Meliadine, and Fosterville mines. All operations performing at or above guidance.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Agnico Eagle Announces Upper Beaver Development Decision',
        date: new Date('2025-09-15'),
        summary: 'Agnico Eagle announced a positive development decision for the Upper Beaver gold project in Ontario with expected annual production of 300,000 oz over a 15-year mine life.',
        isMaterial: true,
        sourceUrl: 'https://agnicoeagle.com/news/upper-beaver-2025',
      },
    ],
  },
  {
    ticker: 'OR',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements',
        date: new Date('2025-11-06'),
        summary: 'Osisko reported Q3 attributable gold equivalent ounces of 22,500 from its royalty and streaming portfolio. Total revenues of $78M with operating margin above 90%.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Osisko Acquires New Royalty on Tier-One Gold Asset',
        date: new Date('2025-10-08'),
        summary: 'Osisko Gold Royalties acquired a 1.5% NSR royalty on a tier-one gold development project for $120M, expanding its portfolio of high-quality precious metals royalties.',
        isMaterial: true,
        sourceUrl: 'https://osiskogr.com/news/royalty-acquisition-2025',
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q2 2025",
        date: new Date('2025-08-13'),
        summary: 'Q2 MD&A reviewing portfolio of over 185 royalties and streams. Canadian Malartic NSR royalty remains the cornerstone asset generating $18M in quarterly revenue.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'ELD',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-04'),
        summary: 'Q3 operational review covering Kisladag, Lamaque, and Efemcukuru mines. Gold production of 125,000 oz with reduced AISC of $1,210/oz through operational improvements.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements',
        date: new Date('2025-11-04'),
        summary: 'Eldorado Gold consolidated financial results showing revenue of $310M and adjusted earnings of $0.45 per share. Net debt reduced to $180M.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Eldorado Gold Announces Skouries Construction Progress',
        date: new Date('2025-09-25'),
        summary: 'Eldorado provided a construction update on the Skouries copper-gold project in Greece, reporting 75% completion with first production targeted for mid-2026.',
        isMaterial: true,
        sourceUrl: 'https://eldoradogold.com/news/skouries-update-2025',
      },
    ],
  },
  {
    ticker: 'SII',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Consolidated Financial Statements',
        date: new Date('2025-11-08'),
        summary: 'Sprott Inc. reported Q3 AUM of $31.5B with net inflows of $1.2B. Management fee revenue of $42M driven by growth in physical precious metals trusts.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-08'),
        summary: 'Review of Sprott Asset Management, Sprott Capital Partners, and Sprott Physical Trusts divisions. Uranium trust (SPUT) continues to see record investor demand.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Sprott Launches New Critical Minerals Investment Vehicle',
        date: new Date('2025-10-02'),
        summary: 'Sprott Inc. announced the launch of a new critical minerals investment vehicle targeting copper, lithium, and rare earth exposure for institutional investors.',
        isMaterial: true,
        sourceUrl: 'https://sprott.com/news/critical-minerals-launch-2025',
      },
    ],
  },
  {
    ticker: 'BTO',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Consolidated Financial Statements',
        date: new Date('2025-11-05'),
        summary: 'B2Gold reported gold production of 245,000 oz in Q3 from Fekola, Masbate, and Otjikoto mines. Revenue of $580M with strong operating margins at elevated gold prices.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-05'),
        summary: 'Comprehensive operational review. Fekola mine in Mali remains flagship operation with 155,000 oz produced. Goose project in Nunavut advancing toward first gold pour.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'B2Gold Announces Goose Project First Gold Pour Target',
        date: new Date('2025-09-28'),
        summary: 'B2Gold confirmed the Back River Gold District Goose project in Nunavut, Canada is on track for first gold pour in Q2 2025, with all major construction milestones achieved.',
        isMaterial: true,
        sourceUrl: 'https://b2gold.com/news/goose-gold-pour-2025',
      },
    ],
  },
  {
    ticker: 'NGD',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-12'),
        summary: 'Q3 MD&A for New Gold covering Rainy River and New Afton operations in Canada. Combined gold equivalent production of 85,000 oz with improving cost profile.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'New Gold Reports Strong Q3 Operating Results',
        date: new Date('2025-10-17'),
        summary: 'New Gold announced improved quarterly results with Rainy River producing 55,000 oz gold and New Afton contributing 30,000 oz gold equivalent. AISC declined 8% quarter-over-quarter.',
        isMaterial: false,
        sourceUrl: 'https://newgold.com/news/q3-operations-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Interim Financial Statements',
        date: new Date('2025-08-07'),
        summary: 'Q2 financial statements with revenue of $220M. Net debt reduced to $310M through strong free cash flow from both operating mines.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'IMG',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Consolidated Financial Statements',
        date: new Date('2025-11-10'),
        summary: 'IAMGOLD reported Q3 gold production of 190,000 oz primarily from Essakane in Burkina Faso and Westwood in Quebec. Cote Gold project contributing first full quarter of production.',
        isMaterial: true,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'IAMGOLD Achieves Commercial Production at Cote Gold',
        date: new Date('2025-10-05'),
        summary: 'IAMGOLD and joint venture partner Sumitomo declared commercial production at the Cote Gold mine in Ontario, Canada, one of the largest gold mines in the country.',
        isMaterial: true,
        sourceUrl: 'https://iamgold.com/news/cote-gold-commercial-production-2025',
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q2 2025",
        date: new Date('2025-08-11'),
        summary: 'Q2 MD&A reviewing transition to three-mine producer with Cote Gold ramp-up. Total gold production guidance revised upward to 700,000-750,000 oz for full year.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'MND',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-14'),
        summary: 'Q3 review for Mandalay Resources covering Costerfield gold-antimony mine in Australia and Bjorkdal gold mine in Sweden. Combined production of 25,000 oz gold equivalent.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements',
        date: new Date('2025-11-14'),
        summary: 'Quarterly financial results with revenue of $68M. Strong margins driven by elevated gold and antimony prices. Free cash flow of $18M for the quarter.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Mandalay Resources Extends Costerfield Mine Life',
        date: new Date('2025-09-20'),
        summary: 'Mandalay announced a two-year mine life extension at Costerfield through successful near-mine exploration, adding 150,000 oz gold equivalent to reserves.',
        isMaterial: true,
        sourceUrl: 'https://mandalayresources.com/news/costerfield-extension-2025',
      },
    ],
  },
  {
    ticker: 'LUG',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements',
        date: new Date('2025-11-06'),
        summary: 'Lundin Gold reported Q3 gold production of 130,000 oz from the Fruta del Norte mine in Ecuador. Revenue of $320M with AISC of $780/oz, among the lowest in the industry.',
        isMaterial: true,
        sourceUrl: null,
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-06'),
        summary: 'Comprehensive Q3 operational review for Fruta del Norte. Underground development progressing on plan with access to higher-grade zones in lower levels.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Lundin Gold Declares Increased Quarterly Dividend',
        date: new Date('2025-10-12'),
        summary: 'Lundin Gold announced a 25% increase to its quarterly dividend, reflecting strong operational performance and cash flow generation at Fruta del Norte.',
        isMaterial: false,
        sourceUrl: 'https://lundingold.com/news/dividend-increase-2025',
      },
    ],
  },
  {
    ticker: 'KRR',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-11'),
        summary: 'Q3 review for Karora Resources covering Beta Hunt and Higginsville operations in Western Australia. Gold production of 38,000 oz with nickel credits improving economics.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Karora Discovers New High-Grade Gold Zone at Beta Hunt',
        date: new Date('2025-10-18'),
        summary: 'Karora Resources announced a significant new high-grade gold discovery at Beta Hunt mine with drill intercepts of 85 g/t over 3.2m in the Fletcher Shear Zone.',
        isMaterial: true,
        sourceUrl: 'https://karoraresources.com/news/beta-hunt-discovery-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Interim Financial Statements',
        date: new Date('2025-08-15'),
        summary: 'Q2 financial results with revenue of $88M and operating cash flow of $32M. Net cash position of $45M after debt repayment.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'RIO',
    filings: [
      {
        type: 'Technical Report',
        title: 'NI 43-101 Technical Report - Fenix Gold Project',
        date: new Date('2025-10-20'),
        summary: 'Updated technical report for Fenix Gold heap leach project in Atacama, Chile. Proven and probable reserves of 3.2M oz gold supporting a 14-year mine life.',
        isMaterial: true,
        sourceUrl: 'https://rio2.com/fenix-technical-report-2025',
      },
      {
        type: 'Press Release',
        title: 'Rio2 Receives Environmental Approval for Fenix Project',
        date: new Date('2025-09-30'),
        summary: 'Rio2 Limited received the Resolucion de Calificacion Ambiental (RCA) environmental approval for the Fenix Gold Project from Chilean environmental authorities.',
        isMaterial: true,
        sourceUrl: 'https://rio2.com/news/fenix-environmental-approval-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Interim Financial Statements',
        date: new Date('2025-08-28'),
        summary: 'Q2 financial statements for pre-production company. Cash and equivalents of $28M sufficient to fund ongoing permitting and engineering activities.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'SBB',
    filings: [
      {
        type: 'Press Release',
        title: 'Sabina Gold & Silver Provides Back River Construction Update',
        date: new Date('2025-11-18'),
        summary: 'Sabina provided a construction update on the Goose mine at the Back River Gold District in Nunavut. Overall construction 85% complete with first gold pour targeted for early 2026.',
        isMaterial: true,
        sourceUrl: 'https://sabinagoldsilver.com/news/construction-update-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Interim Financial Statements',
        date: new Date('2025-10-29'),
        summary: 'Q3 financial statements reflecting ongoing construction expenditures at Goose mine. Total project spend to date of $680M against $810M budget.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Technical Report',
        title: 'Back River Gold District - Updated Mineral Resource Estimate',
        date: new Date('2025-08-22'),
        summary: 'Updated mineral resource estimate for the Back River Gold District including Goose, George, and Boot deposits. Measured and indicated resources of 6.3M oz gold.',
        isMaterial: true,
        sourceUrl: 'https://sabinagoldsilver.com/back-river-mre-2025',
      },
    ],
  },
  {
    ticker: 'GPL',
    filings: [
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-15'),
        summary: 'Q3 MD&A for Great Panther reviewing Tucano mine operations in Brazil. Gold production of 32,000 oz with ongoing cost optimization efforts to improve margins.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'Great Panther Announces Restructuring Plan',
        date: new Date('2025-10-22'),
        summary: 'Great Panther Mining announced a corporate restructuring plan including headcount reduction and non-core asset divestitures to strengthen the balance sheet.',
        isMaterial: true,
        sourceUrl: 'https://greatpanther.com/news/restructuring-2025',
      },
      {
        type: 'Financial Statements',
        title: 'Q2 2025 Financial Statements',
        date: new Date('2025-08-18'),
        summary: 'Q2 results showing revenue of $52M with operating loss of $8M. Elevated AISC of $1,680/oz reflecting challenges at Tucano mine operations.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
  {
    ticker: 'FR',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Consolidated Financial Statements',
        date: new Date('2025-11-09'),
        summary: 'First Majestic reported Q3 silver production of 6.8M oz and gold production of 42,000 oz from six operating mines in Mexico. Revenue of $210M.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q3 2025",
        date: new Date('2025-11-09'),
        summary: 'Operational review covering San Dimas, Santa Elena, La Encantada, Del Toro, La Parrilla, and La Guitarra mines. San Dimas remains primary cash flow contributor.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'First Majestic Announces Jerritt Canyon Restart Plan',
        date: new Date('2025-09-14'),
        summary: 'First Majestic announced plans to restart operations at the Jerritt Canyon gold mine in Nevada following completion of a $45M refurbishment and modernization program.',
        isMaterial: true,
        sourceUrl: 'https://firstmajestic.com/news/jerritt-canyon-restart-2025',
      },
    ],
  },
  {
    ticker: 'AG',
    filings: [
      {
        type: 'Financial Statements',
        title: 'Q3 2025 Financial Statements (NYSE Filing)',
        date: new Date('2025-11-09'),
        summary: 'First Majestic NYSE-listed shares Q3 filing. Consolidated results consistent with TSX reporting with silver equivalent production of 9.2M oz.',
        isMaterial: false,
        sourceUrl: null,
      },
      {
        type: 'Press Release',
        title: 'First Majestic Reports Q3 2025 Production Results',
        date: new Date('2025-10-14'),
        summary: 'First Majestic Silver reported Q3 production of 6.8M oz silver and 42,000 oz gold. All-in sustaining costs of $17.50/oz silver equivalent.',
        isMaterial: false,
        sourceUrl: 'https://firstmajestic.com/news/q3-production-2025',
      },
      {
        type: 'MD&A',
        title: "Management's Discussion & Analysis - Q2 2025",
        date: new Date('2025-08-10'),
        summary: 'Q2 review highlighting operational improvements at San Dimas and Santa Elena mines. Silver grades increasing with access to deeper mining levels.',
        isMaterial: false,
        sourceUrl: null,
      },
    ],
  },
];

/**
 * Seed filings into the database.
 * Looks up stock IDs by ticker and inserts 3 filings per stock (75 total).
 * Skips stocks that are not found in the database.
 */
export async function seedFilings(): Promise<number> {
  if (!db) {
    console.warn('⚠️  Database not available - skipping filing seed');
    return 0;
  }

  console.log('🌱 Seeding filings...');

  let count = 0;
  for (const stockData of filingSeedData) {
    // Look up stock ID by ticker
    const stockRows = await db
      .select({ id: stocks.id })
      .from(stocks)
      .where(eq(stocks.ticker, stockData.ticker))
      .limit(1);

    if (stockRows.length === 0) {
      console.warn(`⚠️  Stock ${stockData.ticker} not found - skipping filings`);
      continue;
    }

    const stockId = stockRows[0].id;

    for (const filing of stockData.filings) {
      await db.insert(filings).values({
        stockId,
        type: filing.type,
        title: filing.title,
        date: filing.date,
        summary: filing.summary,
        isMaterial: filing.isMaterial,
        sourceUrl: filing.sourceUrl,
      });
      count++;
    }
  }

  console.log(`✅ Seeded ${count} filings`);
  return count;
}
