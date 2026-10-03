/**
 * Sprite Catalog (issue 246)
 *
 * Authoritative catalog of office sprites available for insertion,
 * grouped by folder category.
 */

export interface SpriteCatalogItem {
  id: string;
  name: string;
  category: string;
  spritePath: string;
  defaultHeight?: number;
}

export interface SpriteFolderGroup {
  folder: string;
  title: string;
  items: SpriteCatalogItem[];
}

export const SPRITE_CATALOG_GROUPS: SpriteFolderGroup[] = [
  {
    folder: "furniture",
    title: "Furniture",
    items: [
      {
        id: "standing-desk-left-front",
        name: "Standing Desk (Left Front)",
        category: "furniture",
        spritePath: "/sprites/furniture/standing-desk-left-front.png",
        defaultHeight: 181,
      },
      {
        id: "standing-desk-left-rear",
        name: "Standing Desk (Left Rear)",
        category: "furniture",
        spritePath: "/sprites/furniture/standing-desk-left-rear.png",
        defaultHeight: 181,
      },
      {
        id: "standing-desk-right-front",
        name: "Standing Desk (Right Front)",
        category: "furniture",
        spritePath: "/sprites/furniture/standing-desk-right-front.png",
        defaultHeight: 181,
      },
      {
        id: "standing-desk-right-rear",
        name: "Standing Desk (Right Rear)",
        category: "furniture",
        spritePath: "/sprites/furniture/standing-desk-right-rear.png",
        defaultHeight: 181,
      },
      {
        id: "filling-closed",
        name: "Filing Cabinet (Closed)",
        category: "furniture",
        spritePath: "/sprites/furniture/filling-closed.png",
        defaultHeight: 70,
      },
      {
        id: "filling-open",
        name: "Filing Cabinet (Open)",
        category: "furniture",
        spritePath: "/sprites/furniture/filling-open.png",
        defaultHeight: 75,
      },
      {
        id: "desk-wood",
        name: "Wooden Desk",
        category: "furniture",
        spritePath: "/sprites/desk.png",
        defaultHeight: 90,
      },
      {
        id: "office-chair",
        name: "Office Chair",
        category: "furniture",
        spritePath: "/sprites/chair.png",
        defaultHeight: 65,
      },
      {
        id: "coffee-machine",
        name: "Coffee Machine",
        category: "furniture",
        spritePath: "/sprites/coffee-machine.png",
        defaultHeight: 60,
      },
      {
        id: "water-cooler",
        name: "Water Cooler",
        category: "furniture",
        spritePath: "/sprites/watercooler.png",
        defaultHeight: 85,
      },
    ],
  },
  {
    folder: "decoration",
    title: "Decoration",
    items: [
      {
        id: "monstera-plant",
        name: "Monstera Plant",
        category: "decoration",
        spritePath: "/sprites/decoration/monstera-plant.png",
        defaultHeight: 75,
      },
      {
        id: "snake-plant",
        name: "Snake Plant",
        category: "decoration",
        spritePath: "/sprites/decoration/snake-plant.png",
        defaultHeight: 68,
      },
      {
        id: "money-tree",
        name: "Money Tree",
        category: "decoration",
        spritePath: "/sprites/decoration/money-tree.png",
        defaultHeight: 68,
      },
      {
        id: "decor-printer",
        name: "Office Printer",
        category: "decoration",
        spritePath: "/sprites/decoration/printer.png",
        defaultHeight: 72,
      },
      {
        id: "white-board",
        name: "Whiteboard",
        category: "decoration",
        spritePath: "/sprites/decoration/white-board.png",
        defaultHeight: 90,
      },
      {
        id: "potted-plant",
        name: "Potted Plant",
        category: "decoration",
        spritePath: "/sprites/plant.png",
        defaultHeight: 60,
      },
      {
        id: "old-printer",
        name: "Retro Printer",
        category: "decoration",
        spritePath: "/sprites/old-printer.png",
        defaultHeight: 65,
      },
      {
        id: "boss-rug",
        name: "Executive Rug",
        category: "decoration",
        spritePath: "/sprites/boss-rug.png",
        defaultHeight: 100,
      },
      {
        id: "employee-of-month",
        name: "Employee of the Month",
        category: "decoration",
        spritePath: "/sprites/employee-of-month.png",
        defaultHeight: 60,
      },
      {
        id: "wall-outlet",
        name: "Wall Outlet",
        category: "decoration",
        spritePath: "/sprites/wall-outlet.png",
        defaultHeight: 30,
      },
    ],
  },
  {
    folder: "cats",
    title: "Office Cats",
    items: [
      {
        id: "cat-bandit",
        name: "Cat Bandit",
        category: "cats",
        spritePath: "/sprites/cats/cat-bandit.png",
        defaultHeight: 40,
      },
      {
        id: "cat-sprinkles",
        name: "Cat Sprinkles",
        category: "cats",
        spritePath: "/sprites/cats/cat-sprinkles.png",
        defaultHeight: 40,
      },
    ],
  },
  {
    folder: "props",
    title: "Desk Props",
    items: [
      {
        id: "coffee-mug",
        name: "Coffee Mug",
        category: "props",
        spritePath: "/sprites/coffee-mug.png",
        defaultHeight: 30,
      },
      {
        id: "desk-lamp",
        name: "Desk Lamp",
        category: "props",
        spritePath: "/sprites/desk-lamp.png",
        defaultHeight: 45,
      },
      {
        id: "stapler",
        name: "Red Stapler",
        category: "props",
        spritePath: "/sprites/stapler.png",
        defaultHeight: 28,
      },
      {
        id: "magic-8-ball",
        name: "Magic 8-Ball",
        category: "props",
        spritePath: "/sprites/magic-8-ball.png",
        defaultHeight: 30,
      },
      {
        id: "rubber-duck",
        name: "Rubber Duck",
        category: "props",
        spritePath: "/sprites/rubber-duck.png",
        defaultHeight: 30,
      },
      {
        id: "rubiks-cube",
        name: "Rubik's Cube",
        category: "props",
        spritePath: "/sprites/rubiks-cube.png",
        defaultHeight: 28,
      },
      {
        id: "pen-holder",
        name: "Pen Holder",
        category: "props",
        spritePath: "/sprites/pen-holder.png",
        defaultHeight: 32,
      },
      {
        id: "thermos",
        name: "Thermos",
        category: "props",
        spritePath: "/sprites/thermos.png",
        defaultHeight: 35,
      },
      {
        id: "phone",
        name: "Desk Phone",
        category: "props",
        spritePath: "/sprites/phone.png",
        defaultHeight: 32,
      },
      {
        id: "monitor-back",
        name: "Monitor",
        category: "props",
        spritePath: "/sprites/monitor_back.png",
        defaultHeight: 45,
      },
      {
        id: "keyboard-back",
        name: "Keyboard",
        category: "props",
        spritePath: "/sprites/keyboard_back.png",
        defaultHeight: 25,
      },
      {
        id: "headset",
        name: "Headset",
        category: "props",
        spritePath: "/sprites/headset_small.png",
        defaultHeight: 25,
      },
      {
        id: "sunglasses",
        name: "Sunglasses",
        category: "props",
        spritePath: "/sprites/sunglasses.png",
        defaultHeight: 20,
      },
    ],
  },
  {
    folder: "characters",
    title: "Characters",
    items: [
      "michael-scott",
      "dwight-schrute",
      "jim-halpert",
      "pam-beesly",
      "ryan-howard",
      "andy-bernard",
      "angela-martin",
      "kevin-malone",
      "oscar-martinez",
      "stanley-hudson",
      "phyllis-vance",
      "toby-flenderson",
      "kelly-kapoor",
      "creed-bratton",
      "meredith-palmer",
      "darryl-philbin",
      "erin-hannon",
      "gabe-lewis",
      "holly-flax",
      "jan-levinson",
      "karen-filippelli",
      "david-wallace",
      "bob-vance",
      "carol-stills",
      "nellie-bertram",
      "robert-california",
      "roy-anderson",
    ].map((slug) => ({
      id: `char-${slug}`,
      name: slug
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" "),
      category: "characters",
      spritePath: `/sprites/office/characters/${slug}-front-right.png`,
      defaultHeight: 133,
    })),
  },
  {
    folder: "effects",
    title: "Status & Effects",
    items: [
      {
        id: "typing-effect",
        name: "Typing Bubble",
        category: "effects",
        spritePath: "/sprites/effects/typing.png",
        defaultHeight: 40,
      },
      {
        id: "sleeping-effect",
        name: "Sleeping Zzz",
        category: "effects",
        spritePath: "/sprites/effects/sleeping.png",
        defaultHeight: 40,
      },
      {
        id: "need-coffee-effect",
        name: "Need Coffee",
        category: "effects",
        spritePath: "/sprites/effects/need-coffee.png",
        defaultHeight: 40,
      },
      {
        id: "glass-water-effect",
        name: "Glass of Water",
        category: "effects",
        spritePath: "/sprites/effects/glass-water.png",
        defaultHeight: 35,
      },
    ],
  },
];

/**
 * Issue 246 review I4: look up a catalog item by its public sprite path so
 * inserted sprites can use the catalog's display height instead of the raw
 * texture size.
 */
export function spriteCatalogItemByPath(
  path: string,
): SpriteCatalogItem | null {
  for (const group of SPRITE_CATALOG_GROUPS) {
    for (const item of group.items) {
      if (item.spritePath === path) return item;
    }
  }
  return null;
}
