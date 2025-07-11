let Keyboard = window.SimpleKeyboard.default;

let keyboard = new Keyboard({
    onChange: input => onChange(input),
    onKeyPress: button => onKeyPress(button),
    mergeDisplay: true,
    layoutName: "default",
    layout: {
        default: [
            "💡 🏠 🧠 ▶️ 📺",
            "q w e r t y u i o p",
            "a s d f g h j k l",
            "{shift} z x c v b n m {backspace}",
            "{numbers} {space} {ent}"
        ],
        shift: [
            "Q W E R T Y U I O P",
            "A S D F G H J K L",
            "{shift} Z X C V B N M {backspace}",
            "{numbers} {space} {ent}"
        ],
        numbers: ["1 2 3", "4 5 6", "7 8 9", "{abc} 0 {backspace}"]
    },
    display: {
        "{numbers}": "123",
        "{ent}": "return",
        "{escape}": "esc ⎋",
        "{tab}": "tab ⇥",
        "{backspace}": "⌫",
        "{capslock}": "caps lock ⇪",
        "{shift}": "⇧",
        "{controlleft}": "ctrl ⌃",
        "{controlright}": "ctrl ⌃",
        "{altleft}": "alt ⌥",
        "{altright}": "alt ⌥",
        "{metaleft}": "cmd ⌘",
        "{metaright}": "cmd ⌘",
        "{abc}": "ABC"
    }
});

/**
 * Update simple-keyboard when input is changed directly
 */
document.querySelector(".input").addEventListener("input", event => {
    keyboard.setInput(event.target.value);
});

console.log(keyboard);

function onChange(input) {
    document.querySelector(".input").value = input;
    console.log("Input changed", input);
}

function onKeyPress(button) {
    console.log("Button pressed", button);

    /**
     * If you want to handle the shift and caps lock buttons
     */
    if (button === "{shift}" || button === "{lock}") handleShift();
    if (button === "{numbers}" || button === "{abc}") handleNumbers();
}

function handleShift() {
    let currentLayout = keyboard.options.layoutName;
    let shiftToggle = currentLayout === "default" ? "shift" : "default";

    keyboard.setOptions({
        layoutName: shiftToggle
    });
}

function handleNumbers() {
    let currentLayout = keyboard.options.layoutName;
    let numbersToggle = currentLayout !== "numbers" ? "numbers" : "default";

    keyboard.setOptions({
        layoutName: numbersToggle
    });
}

let awesomplete = new Awesomplete(document.querySelector("#autocomplete-input"), {
    list: ["item1", "item2", "item3"] // Remplacez par votre liste de suggestions
});
