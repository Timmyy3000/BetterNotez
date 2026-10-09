/** Spoken text for each stage of a card drag. It names the task and its column, never an id. */
export const announce = {
  pickedUp: (title: string) => `Picked up ${title}.`,
  movedOver: (title: string, column: string | undefined) =>
    column === undefined ? `${title} is not over a column.` : `${title} was moved over ${column}.`,
  droppedIn: (title: string, column: string | undefined) =>
    column === undefined ? `${title} was dropped.` : `${title} was dropped in ${column}.`,
  cancelled: (title: string) => `Dragging ${title} was cancelled.`,
};
