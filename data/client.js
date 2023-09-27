async function leftRetractDown() {
    await postCommand("l-ret");
}

async function leftExtendDown() {
    await postCommand("l-ext");
}

async function rightRetractDown() {
    await postCommand("r-ret");
}

async function rightExtendDown() {
    await postCommand("r-ext");
}

async function leftRetractUp() {
    await postCommand("l-0");
}

async function leftExtendUp() {
    await postCommand("l-0");
}

async function rightRetractUp() {
    await postCommand("r-0");
}

async function rightExtendUp() {
    await postCommand("r-0");
}


async function postCommand(command) {
    $.post("/command", {command}).fail(function() {
        alert("Command failed");
        location.reload();
    });
}