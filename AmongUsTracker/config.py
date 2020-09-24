# Add keywords e.g. keyword_defeat = {"dafeatfa","deafeat;"}
keyword_victory = {}
keyword_defeat = {}
keyword_imposter = {}
keyword_crewmate = {}
keyword_voting_ended = {}
keyword_whos_imposter = {}

screen_resolution = "1920x1080"

# Adjust height of first grab (This grabs keywords for 'defeat', 'victory', 'imposter', 'crewmate')
adjust_x = 0
adjust_y = -10

# Adjust height of cropped image (This is for keywords such as 'voting soon', 'whos the imposter?')
adjust_x_2 = 0
adjust_y_2 = 0

x_extend_crop = 150  # pixels
y_extend_crop = 50  # pixels

monitor_number = 1

delay_start = 0  # adjust time delay from when you get imposter/crewmate till round start. 1 = one second more delay, -0.5 = 0.5 seconds less time
delay_voting = 5  # adjust time delay for when voting is ended to when the round starts

# time_delay is added or taken away from the delay set between when the screen
# shows imposter, crewmate, or vote ended to when the round starts

debug_mode = False  # Shows parsed output coming from image to text algorithm

# Add these by creating webhook from the Discord server and default channel to manage
webhookURL = "https://discordapp.com/api/webhooks/756786629611618374/U7oG-1CFi6AHxuWyQ6SzyAKRX7hRmLk_ZDmbIbQsFmJkNupgR48GOi_-o4DoG5G3OaYo"
channelID = "757106563877175366"
