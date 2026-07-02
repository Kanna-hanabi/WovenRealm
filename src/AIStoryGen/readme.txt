织境空间 (AIStoryGen) v0.1.314
=============================
A DoL (Degrees of Lewdity) mod that lets you call DeepSeek (or any
OpenAI-compatible API) to generate narrative text on the fly.

------------------------------------------------------------
1. INSTALL
------------------------------------------------------------
Zip the AIStoryGen folder so that boot.json sits at the root of the
zip, e.g.:

    AIStoryGen.zip
      |- boot.json
      |- aiMacro.js
      |- settings.twee
      |- ui.css
      |- readme.txt

Launch "Degrees of Lewdity.html" in your browser. On the title screen
press Alt+M (or click the ModLoaderGui button) to open the mod
loader, then load AIStoryGen.zip.

NOTE: The mod is stored in IndexedDB, you do NOT need to re-load it
every time. It will auto-load on subsequent launches until you
manually remove it.

------------------------------------------------------------
2. FIRST-TIME SETUP
------------------------------------------------------------
After loading the mod, go to the game's main Settings page (in your
bedroom or the title screen). You'll see a new "AI Settings" tab
next to Quick Edit, Game Settings, etc.

Alternatively, in the browser DevTools Console (F12) run:

    Engine.play("AIStoryGen_Config")

to jump to the settings passage. Fill in:

  - API Key:    your DeepSeek key (sk-...)
  - Endpoint:   https://api.deepseek.com/v1/chat/completions  (default)
  - Model:      deepseek-chat  (or deepseek-reasoner)
  - Language:   en  or  zh
  - Jailbreak:  optional custom system prompt prefix

Click "Save", then "Test Connection" — it should reply "OK → OK"
or similar. If you get a CORS error, see TROUBLESHOOTING below.

You can also try the demo passage:

    Engine.play("AIStoryGen_Demo")

------------------------------------------------------------
3. USAGE
------------------------------------------------------------
In ANY passage (your own scenes, custom passages, even modified DoL
passages via another mod), use the macro:

    <<aigen "instruction in plain English">>

Example:

    You step into the alley.
    <<aigen "Describe a tense, cold atmosphere as the player notices
             a faint sound behind them.">>

The macro will:
  1. Show "Generating…" placeholder.
  2. Build a prompt containing:
       - <state>           : selected V.* variables (gender/arousal/
                             worn/money/...)
       - <recent_story>    : last N rendered passages (default 3)
       - <scene>           : location/time/NPC
       - <instruction>     : your macro argument
  3. Call DeepSeek and replace the placeholder with the result.

------------------------------------------------------------
4. CONFIG REFERENCE
------------------------------------------------------------
Stored in localStorage["aiStoryGen_cfg"]. Editable via the settings
passage or directly in DevTools:

  apiKey       string   DeepSeek API key
  endpoint     string   default https://api.deepseek.com/v1/chat/completions
  model        string   default "deepseek-chat"
  temperature  number   default 0.9
  max_tokens   number   default 400
  jailbreak    string   prepended to system prompt (default empty)
  tier         number   1 = minimal state
                        2 = + NPC / pregnancy / transformations  (default)
                        3 = + full worn outfit detail
  language     "en"|"zh"  output language (default "en")
  recentMax    number   how many recent passages to include (0 disables)
  recentLimit  number   per-passage char limit (default 600)

------------------------------------------------------------
5. TROUBLESHOOTING
------------------------------------------------------------
* "API Key not set"
  -> Visit AIStoryGen_Config and save a key.

* CORS / network error
  -> DeepSeek officially supports CORS for browser calls. If you use
     a proxy, ensure it returns Access-Control-Allow-Origin: *.

* "[AI error] HTTP 401"
  -> Wrong/expired API key.

* "[AI error] HTTP 402"
  -> Out of credit on your DeepSeek account.

* AI ignores the player's clothes/state
  -> Increase tier from 1 to 2 or 3 in settings.

* AI generates Chinese when you want English (or vice versa)
  -> Set language to 'en' or 'zh' explicitly.

* AI breaks the fourth wall / outputs "Sure, here is..."
  -> Add a stronger jailbreak / role-lock prefix in the Jailbreak
     field. The base style contract already forbids meta commentary,
     but some models still slip.

------------------------------------------------------------
6. SAVE COMPATIBILITY
------------------------------------------------------------
This mod does NOT write to State.variables. All config and recent
memory are kept outside the save:
  - config        : localStorage
  - recent_buffer : in-memory only (cleared on page reload)
So your DoL save files remain fully compatible with vanilla / other
mods.

------------------------------------------------------------
7. LICENSE
------------------------------------------------------------
MIT. Use freely. Not affiliated with DoL upstream or DeepSeek.
