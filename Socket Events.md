# Socket events

## Invoice status
### Requests
* `subscribe` - Subscribe to a invoices progress. Returns `true` if successful.
    * `selector` - Your selector

### Events
* `status` - Status changed (see PaymentStatus enum)
* `confirmationUpdate` - When there is a new confirmation on the transaction
    * `count` - Count of confirmations