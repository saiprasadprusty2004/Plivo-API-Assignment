## Install

Open a terminal inside this project folder and run:

npm install

Create a .env file from the example file:

copy ..env.remembertochangetoENV to .env

Edit .env and fill in your values:

PORT=3000

PUBLIC_BASE_URL=https://your-url.ngrok-free.dev

PLIVO_FROM_NUMBER=(Given by plivo in docs)

PLIVO_AUTH_ID=FillAuthID

PLIVO_AUTH_TOKEN=FillAutoToken

CALL_OTP=1904 (My birthday is 19th april)

DEFAULT_ASSOCIATE_NUMBER=(Given by plivo in mail)

AUDIO_URL=https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3


## Start ngrok

1) create or login to ngrok account
2) Copy the command which looks like this `ngrok config add-authtoken 3DnsWomboA.....`

    If Windows does not recognize `ngrok`, use the local exe file:
        `.\tools\ngrok\ngrok.exe config add-authtoken ....`  -- use the directory where ngrok.exe is present

3) `ngrok http 3000`




ngrok will show a forwarding URL like:

https://abc123.ngrok-free.app -> http://localhost:3000

Copy only the HTTPS URL into `.env`:

PUBLIC_BASE_URL=https://abc123.ngrok-free.app

## Run the App

`npm run dev` in the source code folder

The app runs locally at:

http://localhost:3000

## How to Make a Call

Open:

http://localhost:3000


Click `Check Config` first. It should show:

- `hasCredentials: true`
- `otpConfigured: true`
- `publicBaseUrl` with your ngrok URL
- `answerUrl` starting with your ngrok URL

Then enter the phone number to call in E.164 format.

Example for an Indian mobile number:

+919876543210

Click `Start Call`.

## Demo Flow

For the assignment demo:

1. Put your own phone number in `Number to call`.
2. Leave `Associate number` blank to use `+912264236412`, or enter another number.
3. Click `Start Call`.
4. Answer the call.
5. Enter a wrong OTP first.
6. Enter the correct OTP from `CALL_OTP`.
7. Press 1 for English or 2 for Spanish.
8. Press 1 to play the MP3 message.
9. Repeat the call and press 2 to connect to the associate number.



## Project Structure

server.js
public/
  index.html
  style.css
.env.example
package.json
README.md


