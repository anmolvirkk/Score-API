const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

app.use(express.json());

app.get('/games', async (req, res) => {

  const MINIMUM_LARGE_ODD_THRESHOLD = 3;
  const MAXIMUM_SMALL_ODD_THRESHOLD = 1.5;
  const MINIMUM_TEAM_FORM_WINS = 1;
  const MAXIMUM_TEAM_FORM_LOSSES = 0;
  const MINIMUM_OPOSITION_FORM_LOSSES = 1;
  const MAXIMUM_OPOSITION_FORM_WINS = 1;
  const MINIMUM_PREVIOUS_SCORE_GAP = 0.5;

  const getSoccerecoGames = async (day=0) => {
    try {

      const current_date = new Date();
      const tomorrow_date = new Date(current_date);
      tomorrow_date.setDate(current_date.getDate() + day);

      const dd = String(tomorrow_date.getDate()).padStart(2, '0');
      const mm = String(tomorrow_date.getMonth() + 1).padStart(2, '0');
      const yyyy = tomorrow_date.getFullYear();
      
      const formatted_date = `${dd}-${mm}-${yyyy}`;

      const url = `https://www.soccereco.com/soccer-games?date=${formatted_date}`;
  
      const response = await axios.get(url);
      const html = response.data;

      const $ = cheerio.load(html);

      const games = $('.list-games-item');

      const gameData = [];
      
      games.each((_, element) => {
        const $game = $(element);
      
        const url = $game.find('.matchesbar-link').attr('href');
        const date = $game.find('span[data-frmt="%d.%m"]').text();
        const time = $game.find('.match-date__time').text();
        const homeTeam = $game.find('.home .teamname').text();
        const awayTeam = $game.find('.away .teamname').text();
        const oddsElements = $game.find('.sizeodd span');
        const oddsData = oddsElements.toArray().map((el) => $(el).text());
        const lastScoreData = $game.find('.lastscore').text();
        const lastScore = lastScoreData !== "" ? lastScoreData.split(':').map((el, index) => {
          return {
            goals: parseFloat(el),
            team: index === 0 ? homeTeam : awayTeam
          }
        }) : [null, null];
        const tipData = $game.find('.tipdisplay').text();
        let tip = 'N/A';
        if(tipData){
          switch (tipData) {
            case "1":
              tip = homeTeam;
            break;
            case "2":
              tip = awayTeam;
            break;
            case "X":
              tip = 'Draw';
            break;
            case "X2":
              tip = awayTeam + ' or Draw';
            break;
            case "1X":
              tip = homeTeam + ' or Draw';
            break;
            case "12":
              tip = homeTeam + ' or ' + awayTeam;
            break;
            default:
              tip = 'N/A';
            break;
          }
        }

        if(lastScore[0]?.goals && lastScore[1]?.goals){

          const goalsDifference = Math.abs(lastScore[0].goals - lastScore[1].goals);

          if(goalsDifference >= MINIMUM_PREVIOUS_SCORE_GAP){

            const homeTeamFormStats = $game.find('.home .form-stats').toArray().map((el) => $(el).text());
            const awayTeamFormStats = $game.find('.away .form-stats').toArray().map((el) => $(el).text());
            
            const countWinsAndLosses = (formStats) => {
              const wins = formStats.filter((stat) => stat === 'W').length;
              const losses = formStats.filter((stat) => stat === 'L').length;
              const draws = formStats.filter((stat) => stat === 'D').length;
              return { wins, losses, draws };
            };
    
            if(homeTeam !== "" && awayTeam !== "" && oddsData.length > 0){
    
              const homeOdds = parseFloat(oddsData[0]);
              const drawOdds = parseFloat(oddsData[1]);
              const awayOdds = parseFloat(oddsData[2]);

              const winningTeamOdds = homeOdds < awayOdds ? homeOdds : awayOdds;
              const losingTeamOdds = homeOdds > awayOdds ? homeOdds : awayOdds;

              if(winningTeamOdds < drawOdds && drawOdds < losingTeamOdds &&  winningTeamOdds <= MAXIMUM_SMALL_ODD_THRESHOLD && losingTeamOdds >= MINIMUM_LARGE_ODD_THRESHOLD){

                      const homeTeamStats = countWinsAndLosses(homeTeamFormStats);
                      const awayTeamStats = countWinsAndLosses(awayTeamFormStats);

                      const winningTeamStats = homeOdds < awayOdds ? homeTeamStats : awayTeamStats;
                      const losingTeamStats = homeOdds > awayOdds ? homeTeamStats : awayTeamStats;

                      if(winningTeamStats.wins >= MINIMUM_TEAM_FORM_WINS && losingTeamStats.losses >= MINIMUM_OPOSITION_FORM_LOSSES){
                          const winningTeam = homeTeamStats.wins > awayTeamStats.wins ? homeTeamStats : awayTeamStats;
                          const losingTeam = homeTeamStats.wins > awayTeamStats.wins ? awayTeamStats : homeTeamStats;
                          if(winningTeam.wins > winningTeam.draws){
      
                            if(winningTeam.losses <= MAXIMUM_TEAM_FORM_LOSSES && losingTeam.wins <= MAXIMUM_OPOSITION_FORM_WINS){
      
                              const teamForm = {
                                [homeTeam]: homeTeamStats,
                                [awayTeam]: awayTeamStats
                              }
                
                              const odds = {
                                [homeTeam]: parseFloat(oddsData[0]),
                                Draw: parseFloat(oddsData[1]),
                                [awayTeam]: parseFloat(oddsData[2]),
                              };
                            
                              const gameInfo = {
                                url,
                                date,
                                time,
                                odds,
                                tip,
                                lastScore,
                                teamForm
                              };
                    
                              gameData.push(gameInfo);
      
                            }
      
                          }
                        
                      }
              }
    
            }

          }

        }
      
      });

      return gameData;

    } catch (err) {
      return null;
    }
  }

  let allSoccerecoGames = [];

  const NUMBER_OF_DAYS_TO_SEARCH = 4;

  for(let i = 0; i <= NUMBER_OF_DAYS_TO_SEARCH; i++){
    const nextDayGames = await getSoccerecoGames(i);
    allSoccerecoGames = [...allSoccerecoGames, ...nextDayGames];
  }

  const getMoreSoccerecoData = async (game) => {
    try {
      
      const url = game.url;
  
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      const tables = $('.tablepredictions');

      let compare_teams_table_data = {
        games_won: {},
        games_lost_or_draw: {},
        games_lost: {},
        games_draw: {},
        last_five_games: {},
        last_five_games_against_each_other: {}
      };

      let predictions_table_data = {
        winner: {
          confidence: 0,
          team: ''
        },
        goals: 0,
        score: ''
      }

      let latest_games_goals_table_data = {}

      tables.each((index, element) => {
        if(index === 1) {
          const compare_teams_table = $(element);
          const compare_teams_table_heading_1 = compare_teams_table.find('th:nth-of-type(1)').text();
          const compare_teams_table_heading_2 = compare_teams_table.find('th:nth-of-type(2)').text();
          const compare_teams_table_rows = compare_teams_table.find('td');
          if(compare_teams_table_heading_1 && compare_teams_table_heading_2){
            let compare_teams_table_row_number = 0;
            let heading = compare_teams_table_heading_2;
            compare_teams_table_rows.each((index, element) => {
              if($(element).text() !== "Last five games" && $(element).text() !== "Last 5 home/away only"){
                heading = heading === compare_teams_table_heading_2 ? compare_teams_table_heading_1 : compare_teams_table_heading_2;
                const compare_teams_table_data_key = Object.keys(compare_teams_table_data)[compare_teams_table_row_number];
                function getWinDrawLossCounts(str) {
                  let wins = 0;
                  let draws = 0;
                  let losses = 0;
                
                  for (const char of str) {
                    if (char === 'W') {
                      wins++;
                    } else if (char === 'D') {
                      draws++;
                    } else if (char === 'L') {
                      losses++;
                    }
                  }
                
                  return { wins, draws, losses };
                }
                if($(element).find('.form-stats').length > 0){
                  compare_teams_table_data = {...compare_teams_table_data, [compare_teams_table_data_key]: {...compare_teams_table_data[compare_teams_table_data_key], [heading]: getWinDrawLossCounts($(element).text())}};
                }else{
                  const dataString = $(element).text();
                  const dataNumber = parseFloat(dataString.match(/\d+(\.\d{1,2})?/)[0], 10);
                  compare_teams_table_data = {...compare_teams_table_data, [compare_teams_table_data_key]: {...compare_teams_table_data[compare_teams_table_data_key], [heading]: dataNumber}};
                }
                if(heading === compare_teams_table_heading_2){
                  compare_teams_table_row_number++;
                }
              }
            })
          }
        }
        if(index === 2) {
          const predictions_table = $(element);
          const predictions_table_rows = predictions_table.find('td');
          let predictions_table_row_number = 0;
          predictions_table_rows.each((_, element) => {
              const predictions_table_data_key = Object.keys(predictions_table_data)[predictions_table_row_number];
              const dataString = $(element).text().toLowerCase();
              let formattedData = null;
              switch (predictions_table_data_key) {
                case 'goals':
                  formattedData = parseFloat(dataString.match(/\d+(\.\d{1,2})?/)[0]);
                break;
                case 'score':
                  const scoreData = dataString.match(/\d+:\d+/)[0];
                  const teamScores = scoreData.split(':');
                  const team1Score = parseFloat(teamScores[0]);
                  const team2Score = parseFloat(teamScores[1]);
                  formattedData = {
                    winner: team1Score > team2Score ? team1Score : team2Score,
                    loser: team1Score > team2Score ? team2Score : team1Score
                  }
                break;
                case 'winner':
                  const parts = dataString.split(" on ");
                  if(parts.length === 2){
                    const confidence = parseFloat(parts[0]);
                    const team = parts[1];
                    formattedData = { confidence, team };
                  }
                break;
              }
              predictions_table_data = {...predictions_table_data, [predictions_table_data_key]: formattedData};
              predictions_table_row_number++;
          })
        }
        if(index === 3){
          const latest_games_goals_table = $(element);
          const latest_games_goals_table_rows = latest_games_goals_table.find('td');
          const latest_games_goals_table_headings = latest_games_goals_table.find('th');
          let key = null;
          latest_games_goals_table_rows.each((_, element) => {
              const colSpan = $(element).attr('colspan');
              if(colSpan){
                key = $(element).text().toLowerCase();
                const parent = $(element).parent();
                const nextSibling = parent.next();
                const nextCells = nextSibling.find('td');
                const nextCell1 = nextCells.eq(0).text();
                const nextCell2 = nextCells.eq(1).text();
                const heading1 = latest_games_goals_table_headings.eq(0).text();
                const heading2 = latest_games_goals_table_headings.eq(1).text();
                latest_games_goals_table_data[key] = {
                  [heading1]: nextCell1.includes('%') ? nextCell1 : parseFloat(nextCell1),
                  [heading2]: nextCell2.includes('%') ? nextCell2 : parseFloat(nextCell2)
                }
              }
          })
        }
      })

      let head_to_head_table_data = {};

      let home_team_table_data = {};

      let away_team_table_data = {};

      const listGames = $('.list-games');

      listGames.each((index, element) => {
        if(index === 0){
          
          const lastResults = $(element).find('.lastresults');

          lastResults.each((_, element) => {
                const date = $(element).find('.date-time-wrapper > small > span').text();
                const home = $(element).find('.teams > .home').text();
                const away = $(element).find('.teams > .away').text();
                const homeScore = $(element).find('.score-container > .home').text();
                const awayScore = $(element).find('.score-container > .away').text();
                head_to_head_table_data = {...head_to_head_table_data, [date]: {
                  [home]: parseFloat(homeScore),
                  [away]: parseFloat(awayScore)
                }};
          })

        }
        if(index === 1){
          
          const lastResults = $(element).find('.lastresults');

          lastResults.each((_, element) => {
                const date = $(element).find('.date-time-wrapper > small > span').text();
                const home = $(element).find('.teams > .home').text();
                const away = $(element).find('.teams > .away').text();
                const homeScore = $(element).find('.score-container > .home').text();
                const awayScore = $(element).find('.score-container > .away').text();
                home_team_table_data = {...home_team_table_data, [date]: {
                  [home]: parseFloat(homeScore),
                  [away]: parseFloat(awayScore)
                }};
          })

        }
        if(index === 2){
          
          const lastResults = $(element).find('.lastresults');

          lastResults.each((_, element) => {
                const date = $(element).find('.date-time-wrapper > small > span').text();
                const home = $(element).find('.teams > .home').text();
                const away = $(element).find('.teams > .away').text();
                const homeScore = $(element).find('.score-container > .home').text();
                const awayScore = $(element).find('.score-container > .away').text();
                away_team_table_data = {...away_team_table_data, [date]: {
                  [home]: parseFloat(homeScore),
                  [away]: parseFloat(awayScore)
                }};
          })

        }
      })

      const extraTables = $('.extratable');

      let power_rank_table_data = {
        h2h: {}
      }

      extraTables.each((index, tableElement) => {
        const table = $(tableElement);
        const rows = table.find('tr');

        const headers = [];
        rows.eq(0).find('th').each((j, header) => {
          headers.push($(header).text());
        });

        rows.slice(1).each((_, row) => {
          const rowData = {};
          let team = null;
          $(row).find('td').each((j, cell) => {
            let cellText = $(cell).text();
            if(headers[j] === "Team"){
              team = cellText;
            }else{
              if(!cellText.includes('%') && !cellText.includes(':')){
                cellText = parseFloat(cellText);
              }
              rowData[headers[j]] = cellText;
            }
          });
          if(team){
            if(index === 0){
              power_rank_table_data['h2h'][team] = rowData;
            }else{
              power_rank_table_data[team] = rowData;
            }
          }

        });
      });

      let overall_standings_table_data = {}

      const leagueStandings = $('.LeagueStandings table:not(.extratable)');

      const leagueStandingsRows = leagueStandings.find('tr');

      const leagueStandingsHeaders = [];

      leagueStandings.find('tr').eq(0).find('th').each((j, header) => {
        leagueStandingsHeaders.push($(header).text());
      });

      leagueStandingsRows.slice(1).each((_, row) => {
        const rowData = {};
        let team = null;
        const className = $(row).attr('class');
        if(className === "home" || className === "away"){

          $(row).find('td').each((j, cell) => {
            let cellText = $(cell).text();
            if(leagueStandingsHeaders[j] === "Team"){
              const match = cellText.match(/^\d+/g);
              const position = parseInt(match[0], 10);
              team = cellText.replace(match[0], '').trim();
              rowData['position'] = position;
            }else{
              if(!cellText.includes('%') && !cellText.includes(':')){
                cellText = parseFloat(cellText);
              }
              rowData[leagueStandingsHeaders[j]] = cellText;
            }
          });
          if(team){
            overall_standings_table_data[team] = rowData;
          }

        }

      });

      return {...game, additional_data: {compare_teams_table_data, predictions_table_data, head_to_head_table_data, latest_games_goals_table_data, power_rank_table_data, home_team_table_data, away_team_table_data, overall_standings_table_data}};

    } catch (err) {
      return null;
    }
  }

  let allGames = [];

  for(let i = 0; i < allSoccerecoGames.length; i++){
      const gameData = await getMoreSoccerecoData(allSoccerecoGames[i]);
      allGames.push(gameData);
  }

  res.json(allGames);

});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});