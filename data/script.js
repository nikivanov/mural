function leftRetractDown() {
    postCommand("l-ret");
}

function leftExtendDown() {
    postCommand("l-ext");
}

function rightRetractDown() {
    postCommand("r-ret");
}

function rightExtendDown() {
    postCommand("r-ext");
}

function leftRetractUp() {
    postCommand("l-0");
}

function leftExtendUp() {
    postCommand("l-0");
}

function rightRetractUp() {
    postCommand("r-0");
}

function rightExtendUp() {
    postCommand("r-0");
}


function postCommand(command) {
    $.post("/command", {command});
}

function run1() {
    $.post("/run1", {});
}

function run2() {
    $.post("/run2", {});
}