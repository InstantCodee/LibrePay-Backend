# Socket events

## Invoice status
In order to receive updates about the a specific invoice, **you have to join the room with the selector.**
### Events
* `status` - Status changed (see PaymentStatus enum)
* `confirmationUpdate` - When there is a new confirmation on the transaction
    * `count` - Count of confirmations