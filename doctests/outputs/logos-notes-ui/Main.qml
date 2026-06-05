import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Item {
    id: root
    width: 400
    height: 300

    // The piece of state the button changes.
    property int count: 0

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        Text {
            Layout.alignment: Qt.AlignHCenter
            text: "NotesUi"
            font.pixelSize: 24
            font.bold: true
            color: "#1f2328"
        }

        // Reacts to `count`: the visible proof a click did something.
        Text {
            Layout.alignment: Qt.AlignHCenter
            text: root.count === 0
                ? "No notes yet"
                : "Added note #" + root.count
            font.pixelSize: 16
            color: "#1a7f37"
        }

        Button {
            Layout.alignment: Qt.AlignHCenter
            text: "Add Note"
            onClicked: root.count += 1
        }
    }
}
