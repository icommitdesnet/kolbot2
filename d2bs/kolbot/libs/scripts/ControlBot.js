/**
*  @filename    ControlBot.js
*  @author      theBGuy
*  @credits     kolton (for the original Enchant.js),
*               magace (for the inspiration to add rush commands)
*  @desc        Chat controlled bot for other players. Can open cow portal, give waypoints on command, bo, or enchant
*
*/

function ControlBot () {
  // Quests
  const {
    andariel,
    cube,
    radament,
    amulet,
    staff,
    summoner,
    duriel,
    lamesen,
    brain,
    heart,
    eye,
    travincal,
    mephisto,
    izual,
    diablo,
    shenk,
    anya,
    ancients,
    baal,
  } = require("../systems/autorush/AutoRush");
  const {
    AutoRush,
    RushModes,
  } = require("../systems/autorush/RushConfig");
  const Worker = require("../modules/Worker");

  AutoRush.rushMode = RushModes.chanter;
  AutoRush.playersIn = "in";
  AutoRush.playersOut = "out";
  AutoRush.allIn = "all in";

  const MAX_CHAT_LENGTH = 180;
  const startTime = getTickCount();
  const maxTime = Time.minutes(Config.ControlBot.GameLength);
  const chantDuration = Skill.getDuration(sdk.skills.Enchant);
  /** @type {Map<string, string>} */
  const players = new Map();

  const Chat = {
    /** @type {string[]} */
    queue: [],

    /**
     * Send a message in chat
     * @param {string} msg 
     */
    say: function (msg) {
      Chat.queue.push(msg);
    },

    /**
     * Whisper a chat to a user
     * @param {string} nick 
     * @param {string} msg 
     */
    whisper: function (nick, msg) {
      if (!players.has(nick) && !Misc.findPlayer(nick)) {
        console.debug("Player not found: " + nick);
        return;
      }
      let who = players.get(nick) || nick;
      Chat.queue.push("/w " + who + " " + msg);
    },
  };

  Worker.runInBackground.chat = (function () {
    let tick = getTickCount();

    return function () {
      if (!Chat.queue.length) return true;
      // should check if next msg is going to be a whisper and if so
      // check if the player is in the game and if not, don't send the whisper
      if (getTickCount() - tick < 0) return true;
      // allow say messages every ~1.5 seconds
      tick = getTickCount() + Time.seconds(1) + rand(250, 750);
      console.debug("(" + Chat.queue[0] + ")");
      if (Chat.queue[0].length > MAX_CHAT_LENGTH) {
        console.debug("Message too long, splitting.");
        Chat.queue[0] = Chat.queue[0].substring(0, MAX_CHAT_LENGTH);
      }
      say(Chat.queue.shift());
      return true;
    };
  })();
  
  /** @constructor */
  function PlayerTracker () {
    this.firstCmd = getTickCount();
    this.commands = 0;
    this.ignored = false;
  }

  PlayerTracker.prototype.resetCmds = function () {
    this.firstCmd = getTickCount();
    this.commands = 0;
  };

  PlayerTracker.prototype.unIgnore = function () {
    this.ignored = false;
    this.commands = 0;
  };

  /** @constructor */
  function ChantTracker () {
    this.lastChant = getTickCount();
  }

  ChantTracker.prototype.reChant = function () {
    return getTickCount() - this.lastChant >= chantDuration - Time.minutes(1);
  };

  ChantTracker.prototype.update = function () {
    this.lastChant = getTickCount();
  };

  /** @constructor */
  function WpTracker () {
    this.timer = getTickCount();
    this.requests = 0;
  }

  WpTracker.prototype.update = function () {
    this.timer = getTickCount();
    this.requests++;
  };

  WpTracker.prototype.timeSinceLastRequest = function () {
    return getTickCount() - this.timer;
  };

  /** @type {Map<string, PlayerTracker>} */
  const cmdNicks = new Map();
  /** @type {Map<string, WpTracker>} */
  const wpNicks = new Map();
  /** @type {Set<string>} */
  const shitList = new Set();
  /** @type {Array<string>} */
  const greet = [];
  /** @type {Map<string, ChantTracker} */
  const chantList = new Map();

  /** @type {Map<number, Array<number>} */
  const wps = new Map([
    [1, [
      sdk.areas.ColdPlains, sdk.areas.StonyField,
      sdk.areas.DarkWood, sdk.areas.BlackMarsh,
      sdk.areas.OuterCloister, sdk.areas.JailLvl1,
      sdk.areas.InnerCloister, sdk.areas.CatacombsLvl2
    ]
    ],
    [2, [
      sdk.areas.A2SewersLvl2, sdk.areas.DryHills,
      sdk.areas.HallsoftheDeadLvl2, sdk.areas.FarOasis,
      sdk.areas.LostCity, sdk.areas.PalaceCellarLvl1,
      sdk.areas.ArcaneSanctuary, sdk.areas.CanyonofMagic
    ]
    ],
    [3, [
      sdk.areas.SpiderForest, sdk.areas.GreatMarsh,
      sdk.areas.FlayerJungle, sdk.areas.LowerKurast,
      sdk.areas.KurastBazaar, sdk.areas.UpperKurast,
      sdk.areas.Travincal, sdk.areas.DuranceofHateLvl2
    ]
    ],
    [4, [
      sdk.areas.CityoftheDamned, sdk.areas.RiverofFlame
    ]
    ],
    [5, [
      sdk.areas.FrigidHighlands, sdk.areas.ArreatPlateau,
      sdk.areas.CrystalizedPassage, sdk.areas.GlacialTrail,
      sdk.areas.FrozenTundra, sdk.areas.AncientsWay, sdk.areas.WorldstoneLvl2
    ]
    ]
  ]);

  /** @type {[string, string][]} */
  const queue = [];
  const running = {
    nick: "",
    command: "",
  };

  /**
   * @param {string} nick 
   * @returns {boolean}
   */
  const enchant = function (nick) {
    try {
      if (!Misc.inMyParty(nick)) {
        throw new ScriptError("Accept party invite, noob.");
      }

      let unit = Game.getPlayer(nick);

      if (unit && unit.distance > 35) {
        throw new ScriptError("Get closer.");
      }

      if (!unit) {
        let partyUnit = getParty(nick);

        if (!Misc.poll(() => partyUnit.inTown, 500, 50)) {
          throw new ScriptError("You need to be in one of the towns.");
        }
        // wait until party area is readable?
        Chat.say("Wait for me at waypoint.");
        Town.goToTown(sdk.areas.actOf(partyUnit.area));

        unit = Game.getPlayer(nick);
      }

      if (unit) {
        do {
          // player is alive
          if (!unit.dead) {
            if (unit.distance >= 35) {
              throw new ScriptError("You went too far away.");
            }
            Packet.enchant(unit);
            if (Misc.poll(() => unit.getState(sdk.states.Enchant), 500, 50)) {
              chantList.has(unit.name)
                ? chantList.get(unit.name).update()
                : chantList.set(unit.name, new ChantTracker());
            }
          }
        } while (unit.getNext());
      } else {
        Chat.say("I don't see you");
      }

      unit = Game.getMonster();

      if (unit) {
        do {
          // merc or any other owned unit
          if (unit.getParent() && unit.getParent().name === nick) {
            Packet.enchant(unit);
            delay(500);
          }
        } while (unit.getNext());
      }

      return true;
    } catch (e) {
      if (e instanceof ScriptError) {
        Chat.say((typeof e === "object" && e.message ? e.message : typeof e === "string" && e));
      } else {
        console.error(e);
        Chat.say("Internal Error");
      }
      
      return false;
    }
  };

  /**
   * @param {string} nick 
   * @returns {boolean}
   */
  const bo = function (nick) {
    if (!Config.ControlBot.Bo) return false;

    try {
      if (!Misc.inMyParty(nick)) {
        throw new ScriptError("Accept party invite, noob.");
      }

      let partyUnit = getParty(nick);

      // wait until party area is readable?
      if (!Misc.poll(() => Pather.wpAreas.includes(partyUnit.area), 500, 50)) {
        throw new ScriptError("Can't find you or you're not somewhere with a waypoint");
      }
      if (partyUnit.inTown) {
        let a1Wp = Object.values(sdk.areas)
          .filter(function (area) {
            if (area < sdk.areas.ColdPlains || area > sdk.areas.CatacombsLvl2) return false;
            return Pather.wpAreas.includes(area) && me.haveWaypoint(area);
          }).random();
        Chat.whisper(nick, "Go to act 1 waypoint " + getAreaName(a1Wp) + " and wait for me.");
        Pather.useWaypoint(a1Wp);
      } else {
        Pather.useWaypoint(partyUnit.area);
      }

      let unit = Misc.poll(function () {
        return Game.getPlayer(nick);
      }, Time.minutes(1), 1000);

      if (unit && unit.distance > 15) {
        Chat.say("Get closer.");
        
        if (!Misc.poll(() => unit.distance <= 15, Time.seconds(30), 50)) {
          throw new ScriptError("You took to long. Going back to town");
        }
      }

      if (unit && unit.distance <= 15 && !unit.dead) {
        Misc.poll(function () {
          Precast.doPrecast(true);
          return unit.getState(sdk.states.BattleOrders);
        }, 5000, 1000);
        Pather.useWaypoint(sdk.areas.RogueEncampment);
      } else {
        throw new ScriptError("I don't see you");
      }

      return true;
    } catch (e) {
      if (e instanceof ScriptError) {
        Chat.say((typeof e === "object" && e.message ? e.message : typeof e === "string" && e));
      } else {
        console.error(e);
        Chat.say("Internal Error");
      }
      
      return false;
    }
  };

  const autoChant = function () {
    if (!Config.ControlBot.Chant.Enchant) return false;

    let chanted = [];
    let unit = Game.getPlayer();

    if (unit) {
      do {
        if (unit === me.name || unit.dead) continue;
        if (shitList.has(unit.name)) continue;
        if (!Misc.inMyParty(unit.name) || unit.distance > 40) continue;
        // allow rechanting someone if it's going to run out soon for them
        if (!unit.getState(sdk.states.Enchant)
          || (chantList.has(unit.name) && chantList.get(unit.name).reChant())) {
          Packet.enchant(unit);
          if (Misc.poll(() => unit.getState(sdk.states.Enchant), 500, 50)) {
            chanted.push(unit.name);
            chantList.has(unit.name)
              ? chantList.get(unit.name).update()
              : chantList.set(unit.name, new ChantTracker());
          }
        }
      } while (unit.getNext());
    }

    unit = Game.getMonster();

    if (unit) {
      do {
        if (unit.getParent()
          && chanted.includes(unit.getParent().name)
          && !unit.getState(sdk.states.Enchant)
          && unit.distance <= 40) {
          Packet.enchant(unit);
          // not going to re-enchant the minions for now though, will think on how best to handle that later
          if (Misc.poll(() => unit.getState(sdk.states.Enchant), 500, 50)) {
            chanted.push(unit.name);
          }
        }
      } while (unit.getNext());
    }

    return true;
  };

  const getLeg = function () {
    if (me.getItem(sdk.quest.item.WirtsLeg)) {
      return me.getItem(sdk.quest.item.WirtsLeg);
    }

    let leg, gid, wrongLeg;

    if (!Config.ControlBot.Cows.GetLeg) {
      leg = Game.getItem(sdk.items.quest.WirtsLeg);

      if (leg) {
        do {
          if (leg.name.includes("ÿc1")) {
            wrongLeg = true;
          } else if (leg.distance <= 15) {
            gid = leg.gid;
            Pickit.pickItem(leg);

            return me.getItem(-1, -1, gid);
          }
        } while (leg.getNext());
      }

      Chat.say("Bring the leg " + (wrongLeg ? "from this difficulty" : "") + " close to me.");

      return false;
    }

    if (!Pather.journeyTo(sdk.areas.Tristram)) {
      Chat.say("Failed to enter Tristram :(");
      Town.goToTown();

      return false;
    }

    Pather.moveTo(25048, 5177);

    let wirt = Game.getObject(sdk.quest.chest.Wirt);

    for (let i = 0; i < 8; i += 1) {
      wirt.interact();
      delay(500);

      leg = Game.getItem(sdk.quest.item.WirtsLeg);

      if (leg) {
        gid = leg.gid;

        Pickit.pickItem(leg);
        Town.goToTown();

        return me.getItem(-1, -1, gid);
      }
    }

    Town.goToTown();
    Chat.say("Failed to get the leg :(");

    return false;
  };

  const getTome = function () {
    let tpTome = me.findItems(sdk.items.TomeofTownPortal, sdk.items.mode.inStorage, sdk.storage.Inventory);

    if (tpTome.length < 2) {
      let npc = Town.initNPC("Shop", "buyTpTome");
      if (!getInteractedNPC()) throw new Error("Failed to find npc");

      let tome = npc.getItem(sdk.items.TomeofTownPortal);

      if (!!tome && tome.getItemCost(sdk.items.cost.ToBuy) < me.gold && tome.buy()) {
        delay(500);
        tpTome = me.findItems(sdk.items.TomeofTownPortal, sdk.items.mode.inStorage, sdk.storage.Inventory);
        tpTome.forEach(function (book) {
          if (book.isInInventory) {
            let scroll = npc.getItem(sdk.items.ScrollofTownPortal);

            while (book.getStat(sdk.stats.Quantity) < 20) {
              if (!!scroll && scroll.getItemCost(sdk.items.cost.ToBuy) < me.gold) {
                scroll.buy(true);
              } else {
                break;
              }

              delay(20);
            }
          }
        });
      } else {
        throw new Error("Failed to buy tome");
      }
    }

    return tpTome.last();
  };

  /**
   * @param {string} nick 
   * @returns {boolean}
   */
  const openPortal = function (nick) {
    if (!Config.ControlBot.Cows.MakeCows) return false;
    try {
      if (!Misc.inMyParty(nick)) throw new ScriptError("Accept party invite, noob.");
      if (Pather.getPortal(sdk.areas.MooMooFarm)) throw new ScriptError("Cow portal already open.");
      // king dead or cain not saved
      if (me.cows) throw new ScriptError("Can't open the portal because I killed Cow King.");
      if (Config.ControlBot.Cows.GetLeg && !me.tristram && !!Config.Leader && !getParty(Config.Leader)) {
        throw new ScriptError("Can't get leg because I don't have Cain quest.");
      }
      if (!me.diffCompleted) throw new ScriptError("Final quest incomplete.");
    } catch (e) {
      if (e instanceof ScriptError) {
        Chat.say((typeof e === "object" && e.message ? e.message : typeof e === "string" && e));
      } else {
        console.error(e);
        Chat.say("Internal Error");
      }
      return false;
    }

    let leg = getLeg();
    if (!leg) return false;

    let tome = getTome();
    if (!tome) return false;

    if (!Town.openStash()
      || !Cubing.emptyCube()
      || !Storage.Cube.MoveTo(leg)
      || !Storage.Cube.MoveTo(tome)
      || !Cubing.openCube()) {
      return false;
    }

    transmute();
    delay(500);

    for (let i = 0; i < 10; i += 1) {
      if (Pather.getPortal(sdk.areas.MooMooFarm)) {
        return true;
      }

      delay(200);
    }

    Chat.say("Failed to open cow portal.");

    return false;
  };

  /**
   * @param {string} nick 
   * @returns {boolean}
   */
  const giveWps = function (nick) {
    let next = false;
    const nextWatcher = function (who, msg) {
      if (who !== nick) return;
      if (msg === "next") {
        next = true;
      }
    };

    try {
      if (!Misc.inMyParty(nick)) {
        throw new ScriptError("Accept party invite, noob.");
      }

      if (!wpNicks.has(nick)) {
        wpNicks.set(nick, new WpTracker());
      }

      let check = wpNicks.get(nick);
      if (check.requests > 4) {
        throw new ScriptError("You have spent all your waypoint requests for this game.");
      } else if (check.requests > 1 && check.timeSinceLastRequest() < 60000) {
        throw new ScriptError(
          "You may request wp again in "
          + Math.max(0, (60 - Math.floor(check.timeSinceLastRequest() / 1000)))
          + " seconds."
        );
      }

      let act = Misc.getPlayerAct(nick);
      if (!wps.has(act)) return false;
      addEventListener("chatmsg", nextWatcher);

      for (let wp of wps.get(act)) {
        if (checkHostiles()) {
          break;
        }

        try {
          if (next) {
            next = false;
            continue;
          }
          Pather.useWaypoint(wp, true);
          if (Config.ControlBot.Wps.SecurePortal) {
            Attack.securePosition(me.x, me.y, 20, 1000);
          }
          Pather.makePortal();
          Chat.say(getAreaName(me.area) + " TP up");

          if (!Misc.poll(() => (Game.getPlayer(nick) || next), Time.seconds(30), Time.seconds(1))) {
            Chat.say("Aborting wp giving.");

            break;
          }
          next = false;

          delay(5000);
        } catch (error) {
          continue;
        }
      }

      Town.doChores();
      Town.goToTown(1);
      Town.move("portalspot");

      check.update();

      return true;
    } catch (e) {
      if (e instanceof ScriptError) {
        Chat.say((typeof e === "object" && e.message ? e.message : typeof e === "string" && e));
      } else {
        console.error(e);
        Chat.say("Internal Error");
      }
      
      return false;
    } finally {
      removeEventListener("chatmsg", nextWatcher);
    }
  };

  const checkHostiles = function () {
    let rval = false;
    let party = getParty();

    if (party) {
      do {
        if (party.name !== me.name && getPlayerFlag(me.gid, party.gid, 8)) {
          rval = true;

          if (Config.ShitList && !shitList.has(party.name)) {
            shitList.add(party.name);
          }
        }
      } while (party.getNext());
    }

    return rval;
  };

  /**
   * @param {string} command 
   * @returns {boolean}
   */
  const floodCheck = function (command) {
    if (!command || command.length < 2) return false;
    let [cmd, nick] = command;
      
    // ignore overhead messages
    if (!nick) return true;
    // ignore messages not related to our commands
    if (!actions.has(cmd.toLowerCase())) return false;

    if (!cmdNicks.has(nick)) {
      cmdNicks.set(nick, new PlayerTracker());
    }
    const player = cmdNicks.get(nick);

    if (player.ignored) {
      if (getTickCount() - player.ignored < Time.minutes(1)) {
        return true; // ignore flooder
      }

      // unignore flooder
      player.unIgnore();
    }

    player.commands += 1;

    if (getTickCount() - player.firstCmd < Time.seconds(10)) {
      if (player.commands > 5) {
        player.ignored = getTickCount();
        Chat.whisper(nick, "You are being ignored for 60 seconds because of flooding.");
      }
    } else {
      player.resetCmds();
    }

    return false;
  };

  /**
   * @param {string} nick 
   * @param {string} msg
   * @returns {boolean}
   */
  function chatEvent (nick, msg) {
    if (!nick || !msg) return;
    if (nick === me.name) return;
    msg = msg.toLowerCase();
    if (msg.match(/^rush /gi)) {
      msg = msg.split(" ")[1];
    }
    if (!actions.has(msg)) return;
    if (shitList.has(nick)) {
      Chat.say("No commands for the shitlisted.");
    } else {
      if (running.nick === nick && running.command === msg) {
        console.debug("Command already running.");
        return;
      }
      let index = queue.findIndex(function (cmd) {
        return cmd[0] === msg && cmd[1] === nick;
      });
      if (index > -1) {
        Chat.whisper(nick, "You already requested this command. Queue position: " + (index + 1));
      } else {
        queue.push([msg, nick]);
        console.log(queue);
        if (queue.length > 1 || running.nick !== "") {
          Chat.whisper(nick, msg + " has been added to the queue. Queue position: " + (queue.length + 1));
        }
      }
    }
  }

  // eslint-disable-next-line no-unused-vars
  function gameEvent (mode, param1, param2, name1, name2) {
    switch (mode) {
    case 0x02: // "%Name1(%Name2) joined our world. Diablo's minions grow stronger."
      // idle in town
      me.inTown && me.mode === sdk.player.mode.StandingInTown && greet.push(name1);
      if (name2) {
        players.set(name1, "*" + name2);
      }

      break;
    case 0x00: // "%Name1(%Name2) dropped due to time out."
    case 0x01: // "%Name1(%Name2) dropped due to errors."
    case 0x03: // "%Name1(%Name2) left our world. Diablo's minions weaken."
      players.delete(name1);

      break;
    }
  }

  /**
   * @typedef {Object} Action
   * @property {string} desc
   * @property {boolean} hostileCheck
   * @property {boolean} [complete]
   * @property {function(): boolean | void} run
   */
  /** @type {Map<string, Action} */
  const actions = (function () {
    /** @type {Map<string, Action} */
    const _actions = new Map();

    _actions.set("help", {
      desc: "Display commands",
      hostileCheck: false,
      /** @param {string} nick */
      run: function (nick) {
        let str = "";
        let msg = [];
        _actions.forEach((value, key) => {
          if (!value.desc.length) return;
          if (value.complete) return;
          if (value.desc.includes("Rush")) return;
          let desc = (key + " (" + value.desc + "), ");
          if (str.length + desc.length > MAX_CHAT_LENGTH - (nick.length + 2)) {
            msg.push(str);
            str = "";
          }
          str += desc;
        });
        str.length && msg.push(str);
        str = "Rush commands (example: rush andy): ";
        _actions.forEach((value, key) => {
          if (!value.desc.length) return;
          if (value.complete) return;
          if (!value.desc.includes("Rush")) return;
          let desc = (key + ", ");
          if (str.length + desc.length > MAX_CHAT_LENGTH - (nick.length + 2)) {
            msg.push(str);
            str = "";
          }
          str += desc;
        });
        str.length && msg.push(str);
        msg.forEach(function (m) {
          Chat.whisper(nick, m);
        });
      }
    });
    _actions.set("timeleft", {
      desc: "Remaining time for this game",
      hostileCheck: false,
      run: function () {
        let tick = Time.minutes(Config.ControlBot.GameLength) - getTickCount() + startTime;
        let m = Math.floor(tick / 60000);
        let s = Math.floor((tick / 1000) % 60);

        Chat.say(
          "Time left: "
          + (m ? m + " minute" + (m > 1 ? "s" : "")
          + ", " : "") + s + " second" + (s > 1 ? "s." : ".")
        );
      }
    });

    if (Config.ControlBot.Chant.Enchant
      && Skill.canUse(sdk.skills.Enchant)) {
      ["chant", "enchant"]
        .forEach(key => _actions.set(key, {
          desc: "Give enchant",
          hostileCheck: false,
          run: enchant
        }));
      _actions.get("enchant").desc = "";
    } else {
      Config.ControlBot.Chant.AutoEnchant = false;
    }
    
    if (Config.ControlBot.Cows.MakeCows && !me.cows) {
      _actions.set("cows", {
        desc: "Open cow level",
        hostileCheck: true,
        run: openPortal
      });
    }

    if (Config.ControlBot.Wps.GiveWps) {
      _actions.set("wps", {
        desc: "Give wps in act",
        hostileCheck: true,
        run: giveWps
      });
    }

    if (Config.ControlBot.Bo
      && (Skill.canUse(sdk.skills.BattleOrders) || Precast.haveCTA > 0)) {
      _actions.set("bo", {
        desc: "Bo at wp",
        hostileCheck: true,
        run: bo
      });
    }

    if (Config.ControlBot.Rush) {
      if (Config.ControlBot.Rush.Andy) {
        _actions.set("andy", {
          desc: "Rush Andariel",
          hostileCheck: true,
          complete: false,
          run: andariel
        });
      }
      if (Config.ControlBot.Rush.Cube) {
        _actions.set("cube", {
          desc: "Rush Cube",
          hostileCheck: true,
          complete: false,
          run: cube
        });
      }
      if (Config.ControlBot.Rush.Radament) {
        _actions.set("rada", {
          desc: "Rush Radament",
          hostileCheck: true,
          complete: false,
          run: radament
        });
      }
      if (Config.ControlBot.Rush.Staff) {
        _actions.set("staff", {
          desc: "Rush Staff",
          hostileCheck: true,
          complete: false,
          run: staff
        });
      }
      if (Config.ControlBot.Rush.Amulet) {
        _actions.set("amu", {
          desc: "Rush Amulet",
          hostileCheck: true,
          complete: false,
          run: amulet
        });
      }
      if (Config.ControlBot.Rush.Summoner) {
        _actions.set("summoner", {
          desc: "Rush Summoner",
          hostileCheck: true,
          complete: false,
          run: summoner
        });
      }
      if (Config.ControlBot.Rush.Duriel) {
        _actions.set("duri", {
          desc: "Rush Duriel",
          hostileCheck: true,
          complete: false,
          run: duriel
        });
      }
      if (Config.ControlBot.Rush.LamEsen) {
        _actions.set("lamesen", {
          desc: "Rush Lamesen",
          hostileCheck: true,
          complete: false,
          run: lamesen
        });
      }
      if (Config.ControlBot.Rush.Eye) {
        _actions.set("eye", {
          desc: "Rush eye",
          hostileCheck: true,
          complete: false,
          run: eye
        });
      }
      if (Config.ControlBot.Rush.Brain) {
        _actions.set("brain", {
          desc: "Rush brain",
          hostileCheck: true,
          complete: false,
          run: brain
        });
      }
      if (Config.ControlBot.Rush.Heart) {
        _actions.set("heart", {
          desc: "Rush heart",
          hostileCheck: true,
          complete: false,
          run: heart
        });
      }
      if (Config.ControlBot.Rush.Travincal) {
        _actions.set("trav", {
          desc: "Rush Travincal",
          hostileCheck: true,
          complete: false,
          run: travincal
        });
      }
      if (Config.ControlBot.Rush.Mephisto) {
        _actions.set("meph", {
          desc: "Rush Mephisto",
          hostileCheck: true,
          complete: false,
          run: mephisto
        });
      }
      if (Config.ControlBot.Rush.Izual) {
        _actions.set("izzy", {
          desc: "Rush Izual",
          hostileCheck: true,
          complete: false,
          run: izual
        });
      }
      if (Config.ControlBot.Rush.Diablo) {
        _actions.set("diablo", {
          desc: "Rush Diablo",
          hostileCheck: true,
          complete: false,
          run: diablo
        });
      }
      if (Config.ControlBot.Rush.Shenk) {
        _actions.set("shenk", {
          desc: "Rush Shenk",
          hostileCheck: true,
          complete: false,
          run: shenk
        });
      }
      if (Config.ControlBot.Rush.Anya) {
        _actions.set("anya", {
          desc: "Rush Anya",
          hostileCheck: true,
          complete: false,
          run: anya
        });
      }
      if (Config.ControlBot.Rush.Ancients) {
        _actions.set("ancients", {
          desc: "Rush Ancients",
          hostileCheck: true,
          complete: false,
          run: ancients
        });
      }
      if (Config.ControlBot.Rush.Baal) {
        _actions.set("baal", {
          desc: "Rush Baal",
          hostileCheck: true,
          complete: false,
          run: baal
        });
      }
    }

    return _actions;
  })();

  /** @param {[string, string]} command */
  const runAction = function (command) {
    if (!command || command.length < 2) return false;
    console.debug("Checking command: " + command);
    let [cmd, nick] = command;
    if (cmd.match(/^rush /gi)) {
      cmd = cmd.split(" ")[1];
    }

    if (!actions.has(cmd.toLowerCase())) return false;
    let action = actions.get(cmd.toLowerCase());
    if (action.desc.includes("Rush") && action.complete) {
      Chat.whisper(nick, cmd + " disabled because it's already completed.");
      return false;
    }
    if (action.hostileCheck && checkHostiles()) {
      Chat.say("Command disabled because of hostiles.");
      return false;
    }
    running.nick = nick;
    running.command = cmd;
    console.debug(running);

    return action.run(nick);
  };

  // START
  let gameEndWarningAnnounced = false;
  include("oog/ShitList.js");
  Config.ShitList && shitList.add(ShitList.read());

  try {
    addEventListener("chatmsg", chatEvent);
    addEventListener("gameevent", gameEvent);
    Town.doChores();
    Town.goToTown(1);
    Town.move("portalspot");

    while (true) {
      while (greet.length > 0) {
        let nick = greet.shift();

        if (!shitList.has(nick)) {
          Chat.say("Welcome, " + nick + "! For a list of commands say 'help'");
        }
      }

      Town.getDistance("portalspot") > 5 && Town.move("portalspot");

      if (queue.length > 0) {
        try {
          let command = queue.shift();
          if (command && !floodCheck(command)) {
            if (runAction(command)) {
              // check if command was for rush, if so we need to remove that as an option since its now completed
              if (actions.get(running.command).desc.includes("Rush")) {
                console.log("Disabling " + running.command + " from actions");
                actions.get(running.command).complete = true;
              }
            }
          }
        } catch (e) {
          Misc.errorReport(e);
        }
        running.nick = "";
        running.command = "";
      }

      me.act > 1 && Town.goToTown(1);
      Config.ControlBot.Chant.AutoEnchant && autoChant();

      if (getTickCount() - startTime >= maxTime) {
        if (Config.ControlBot.EndMessage) {
          Chat.say(Config.ControlBot.EndMessage);
        }
        delay(1000);

        break;
      } else if (!gameEndWarningAnnounced && getTickCount() - startTime >= maxTime - Time.seconds(30)) {
        Chat.say("Next game in 30 seconds.");
        gameEndWarningAnnounced = true;
      }

      delay(200);
    }
  } finally {
    removeEventListener("chatmsg", chatEvent);
    removeEventListener("gameevent", gameEvent);
  }

  return true;
}
