const body = document.querySelector(`body`),
  selectButton = document.querySelector(`#select-iframe`),
  selectToFullViewButton = document.querySelector(`#select-to-fullview`),
  inputField = document.querySelector(`#selected-iframe`),
  legend = document.querySelector(`legend`),
  discardButton = document.querySelector(`#discard`),
  viewButton = document.querySelector(`#view-button`),
  view = document.querySelector(`#view > use`),
  inputWidth = document.querySelector(`input[name="width"]`),
  inputHeight = document.querySelector(`input[name="height"]`),
  endSelectionButton = document.querySelector(`#end-selection`);


//##############################
// adds click feedback to buttons
[selectButton, selectToFullViewButton, discardButton, viewButton].forEach(element => {
  element.addEventListener(`mousedown`, () => {
    element.setAttribute(`style`, `background-color: hsla(51, 100%, 50%, 0.555)`);
    element.addEventListener(`mouseleave`, () => {
      element.removeAttribute(`style`);
    }, { once: true });
  });

  element.addEventListener(`mouseup`, () => {
    element.removeAttribute(`style`);
  });
});

//##############################
// messages to the content script (content-script.js)

// a message to the content script has one of five forms:
/*
1: {action: `fetch`}
2: {action: `update`, width(number || undefined), height(number || undefined), fullViewOn(boolean || undefined)}
3: {action: `select`, fullViewOn(boolean)}
4: {action: `clear`}
5: {action: `endSelection`}
*/

window.addEventListener(`load`, () => {
  messageContentScript({ action: `fetch` });
});

selectButton.addEventListener(`click`, () => {
  toggleSelectButtons(`off`);
  toggleEndSelectionButton(`on`);

  messageContentScript({ action: `select`, fullViewOn: false });
});

selectToFullViewButton.addEventListener(`click`, () => {
  toggleSelectButtons(`off`);
  toggleEndSelectionButton(`on`);

  messageContentScript({ action: `select`, fullViewOn: true });
});

endSelectionButton.addEventListener(`click`, () => {
  messageContentScript({ action: `endSelection` });
})

discardButton.addEventListener(`click`, () => {
  messageContentScript({ action: `clear` });
});

viewButton.addEventListener(`click`, () => {
  const fullViewOn = view.getAttribute(`href`) === `#compress`;
  messageContentScript({ action: `update`, fullViewOn: !fullViewOn });
  fullViewOn ? view.setAttribute(`href`, `#expand`) : view.setAttribute(`href`, `#compress`);
});

inputWidth.addEventListener(`input`, () => {
  const width = parseFloat(inputWidth.value);
  messageContentScript({ action: `update`, width });
});

inputHeight.addEventListener(`input`, () => {
  const height = parseFloat(inputHeight.value);
  messageContentScript({ action: `update`, height });
});

//##############################
// messages from the content script (content-script.js)

// a message from the content script has one of three forms:
/*
1: {action: `update`, width(number), height(number), fullViewOn(boolean), iframeName(string)}
2: {action: `clear`}
3: {action: `awaitSelection`}
*/

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === `update`) {
    const iframeNameIsValid = typeof (message.iframeName) === `string`,
      widthIsValid = typeof (message.width) === `number`,
      heightIsValid = typeof (message.height) === `number`,
      fullViewOnIsValid = typeof (message.fullViewOn) === `boolean`;

    if (iframeNameIsValid && widthIsValid && heightIsValid && fullViewOnIsValid) {
      toggleEndSelectionButton(`off`)
      toggleSelectButtons(`off`);

      legend.innerText = message.iframeName;
      inputWidth.value = message.width;
      inputHeight.value = message.height;
      view.setAttribute(`href`, message.fullViewOn ? `#compress` : `#expand`);
      inputField.removeAttribute(`disabled`);
    }

    return;
  }

  if (message.action === `clear`) {
    toggleEndSelectionButton(`off`)
    clearInputField();
    toggleSelectButtons(`on`);
    return;
  }

  if (message.action === `awaitSelection`) {
    toggleSelectButtons(`off`);
    clearInputField();
    toggleEndSelectionButton(`on`);
    return;
  }
});

//##############################
// helper functions

// clearInputField clears and disables the input fieldset. it takes no arguments and returns nothing.
function clearInputField() {
  inputField.setAttribute(`disabled`, true);
  legend.innerText = `selected iframe`;
  inputWidth.value = null;
  inputHeight.value = null;
  view.setAttribute(`href`, `#expand`);
}

// toggleSelectButtons disables the select buttons when passed the string:`off` and enables them when passed the string:`on`. it takes one argument and returns nothing. 
function toggleSelectButtons(toggle) {
  if (toggle === `on`) {
    selectButton.removeAttribute(`disabled`);
    selectToFullViewButton.removeAttribute(`disabled`);
  }
  if (toggle === `off`) {
    selectButton.setAttribute(`disabled`, true);
    selectToFullViewButton.setAttribute(`disabled`, true);
  }
}

// toggleEndSelectionButton hides the end-selection button when passed the string:`off` and displays it when passed the string:`on`. it takes one argument and returns nothing,
function toggleEndSelectionButton(toggle) {
  if (toggle === `on`) {
    body.setAttribute(`style`, `height: 19rem`);
    endSelectionButton.setAttribute(`style`, `display: block`);
  }
  if (toggle === `off`) {
    endSelectionButton.removeAttribute(`style`);
    body.removeAttribute(`style`);
  }
}

// messageContentScript sends an object as a message to the content script in the current active browser tab. it takes one object as argument and returns nothing.
async function messageContentScript(messageObject) {
  const [{ id: tabId }] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tabId, messageObject);
}